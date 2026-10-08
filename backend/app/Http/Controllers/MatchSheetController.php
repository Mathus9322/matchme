<?php

namespace App\Http\Controllers;

use App\Http\Resources\GameResource;
use App\Models\Game;
use App\Models\GamePlayer;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/** Feuille de match, mi-temps et remplacements. */
class MatchSheetController extends Controller
{
    /** Compose la feuille d'une équipe avant le coup d'envoi : 4 titulaires, 0 à 2 remplaçants. */
    public function lineup(Request $request, Game $game): GameResource
    {
        $teamId = (int) $request->input('team_id');
        abort_unless($game->canManageTeam($request->user(), $teamId), 403, 'Vous ne pouvez pas composer cette équipe.');
        abort_unless($game->status === Game::STATUS_SCHEDULED, 422, 'La feuille de match ne peut plus être modifiée une fois le match commencé.');

        $playerRule = Rule::exists('players', 'id')->where('team_id', $teamId);
        $validated = $request->validate([
            'team_id' => ['required', 'integer', Rule::in([$game->team_a_id, $game->team_b_id])],
            'starters' => ['required', 'array', 'size:'.Game::STARTERS],
            'starters.*' => ['integer', 'distinct', $playerRule],
            'substitutes' => ['present', 'array', 'max:'.Game::MAX_SUBSTITUTES],
            'substitutes.*' => ['integer', 'distinct', 'not_in:'.implode(',', (array) $request->input('starters', [])), $playerRule],
        ], [
            'starters.size' => 'Choisissez exactement 4 titulaires.',
            'substitutes.max' => 'Deux remplaçants au maximum.',
            'substitutes.*.not_in' => 'Un joueur ne peut pas être à la fois titulaire et remplaçant.',
            'starters.*.exists' => 'Ce joueur n’appartient pas à l’équipe.',
            'substitutes.*.exists' => 'Ce joueur n’appartient pas à l’équipe.',
        ]);

        $team = $teamId === $game->team_a_id ? $game->teamA : $game->teamB;
        $captain = $team->load('players')->captainId();
        if ($captain !== null && ! in_array($captain, $validated['starters'], true)) {
            throw ValidationException::withMessages(['starters' => 'Le capitaine doit être titulaire : il joue toujours en première position.']);
        }
        $validated['starters'] = $team->captainFirst($validated['starters']);

        DB::transaction(function () use ($game, $validated) {
            $game->sheet()->where('team_id', $validated['team_id'])->delete();
            $position = 0;
            foreach (['starters' => GamePlayer::ROLE_STARTER, 'substitutes' => GamePlayer::ROLE_SUBSTITUTE] as $key => $role) {
                foreach ($validated[$key] as $playerId) {
                    $game->sheet()->create([
                        'team_id' => $validated['team_id'],
                        'player_id' => $playerId,
                        'role' => $role,
                        'on_field' => $role === GamePlayer::ROLE_STARTER,
                        'position' => $position++,
                    ]);
                }
            }
        });

        return $this->detailed($game);
    }

    public function halftime(Request $request, Game $game): GameResource
    {
        $this->authorizeGame($request, $game);
        abort_unless($game->status === Game::STATUS_LIVE && $game->phase === Game::PHASE_FIRST_HALF, 422, 'La mi-temps se siffle pendant la première mi-temps.');
        $game->update(['phase' => Game::PHASE_HALFTIME]);

        return $this->detailed($game);
    }

    public function secondHalf(Request $request, Game $game): GameResource
    {
        $this->authorizeGame($request, $game);
        abort_unless($game->phase === Game::PHASE_HALFTIME, 422, 'La seconde mi-temps commence après la mi-temps.');
        $game->update(['phase' => Game::PHASE_SECOND_HALF]);

        return $this->detailed($game);
    }

    /** Remplacement, autorisé uniquement pendant la mi-temps : un remplaçant entre à la place d'un joueur sur le terrain. */
    public function substitute(Request $request, Game $game): GameResource
    {
        $teamId = (int) $request->input('team_id');
        abort_unless($game->canManageTeam($request->user(), $teamId), 403, 'Vous ne pouvez pas faire de remplacement pour cette équipe.');
        abort_unless($game->phase === Game::PHASE_HALFTIME, 422, 'Les remplacements ne sont possibles que pendant la mi-temps.');

        $validated = $request->validate([
            'team_id' => ['required', 'integer', Rule::in([$game->team_a_id, $game->team_b_id])],
            'player_out_id' => ['required', 'integer'],
            'player_in_id' => ['required', 'integer', 'different:player_out_id'],
        ]);

        $sheet = $game->sheet()->where('team_id', $teamId)->get()->keyBy('player_id');
        $out = $sheet->get($validated['player_out_id']);
        $in = $sheet->get($validated['player_in_id']);
        abort_unless($out?->on_field, 422, 'Le joueur remplacé doit être sur le terrain.');
        abort_unless($in && ! $in->on_field, 422, 'Le joueur entrant doit être sur le banc.');
        abort_if($this->isCaptain($game, $teamId, $out->player_id), 422, 'Le capitaine reste sur le terrain, en première position : il ne peut pas être remplacé.');

        DB::transaction(function () use ($game, $out, $in, $validated, $request) {
            // L'entrant prend la place du sortant sur la feuille.
            [$outPosition, $inPosition] = [$out->position, $in->position];
            $out->update(['on_field' => false, 'position' => $inPosition]);
            $in->update(['on_field' => true, 'position' => $outPosition]);
            $game->substitutions()->create([...$validated, 'user_id' => $request->user()->id]);
            $game->touch();
        });

        return $this->detailed($game);
    }

    /** Échange la position de deux joueurs du même groupe (terrain ou banc) : avant le coup d'envoi ou pendant la mi-temps. */
    public function swap(Request $request, Game $game): GameResource
    {
        $teamId = (int) $request->input('team_id');
        abort_unless($game->canManageTeam($request->user(), $teamId), 403, 'Vous ne pouvez pas modifier cette équipe.');
        abort_if($game->status === Game::STATUS_FINISHED, 422, 'Le match est terminé.');
        abort_if($game->status === Game::STATUS_LIVE && $game->phase !== Game::PHASE_HALFTIME, 422, 'Aucun changement pendant le jeu : attendez la mi-temps.');

        $validated = $request->validate([
            'team_id' => ['required', 'integer', Rule::in([$game->team_a_id, $game->team_b_id])],
            'player_a_id' => ['required', 'integer'],
            'player_b_id' => ['required', 'integer', 'different:player_a_id'],
        ]);

        $team = $teamId === $game->team_a_id ? $game->teamA : $game->teamB;
        $game->persistLineup($team->load('players'));

        $sheet = $game->sheet()->where('team_id', $teamId)->get()->keyBy('player_id');
        $a = $sheet->get($validated['player_a_id']);
        $b = $sheet->get($validated['player_b_id']);
        abort_unless($a && $b, 422, 'Ces joueurs ne sont pas sur la feuille de match.');
        abort_unless($a->on_field === $b->on_field, 422, 'Pour faire entrer un remplaçant, utilisez un remplacement (à la mi-temps).');
        abort_if($a->on_field && ($this->isCaptain($game, $teamId, $a->player_id) || $this->isCaptain($game, $teamId, $b->player_id)), 422, 'Le capitaine occupe toujours la première position sur le terrain.');

        DB::transaction(function () use ($a, $b, $game) {
            [$positionA, $positionB] = [$a->position, $b->position];
            $a->update(['position' => $positionB]);
            $b->update(['position' => $positionA]);
            $game->touch();
        });

        return $this->detailed($game);
    }

    private function isCaptain(Game $game, int $teamId, int $playerId): bool
    {
        $team = $teamId === $game->team_a_id ? $game->teamA : $game->teamB;

        return $team->players()->whereKey($playerId)->where('is_captain', true)->exists();
    }

    private function authorizeGame(Request $request, Game $game): void
    {
        abort_unless($game->isManagedBy($request->user()), 403, 'Vous ne gérez pas ce match.');
    }

    private function detailed(Game $game): GameResource
    {
        $game->load(GameResource::DETAIL_RELATIONS);

        return (new GameResource($game))->detailed();
    }
}
