<?php

namespace App\Http\Controllers;

use App\Http\Resources\GameResource;
use App\Models\Competition;
use App\Models\Game;
use App\Models\ResultSheet;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class GameController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $games = Game::query()
            ->with(['competition', 'group', 'teamA', 'teamB'])
            ->withScores()
            ->when($request->query('status'), fn ($q, $status) => $q->whereIn('status', explode(',', $status)))
            ->when($request->query('competition_id'), fn ($q, $id) => $q->where('competition_id', $id))
            ->when($request->boolean('friendly'), fn ($q) => $q->whereNull('competition_id'))
            ->when($request->boolean('mine'), fn ($q) => $q->where('owner_id', $request->user('sanctum')?->id ?? 0))
            ->orderByRaw("case status when 'live' then 0 when 'scheduled' then 1 else 2 end")
            ->orderBy('scheduled_at')
            ->latest('id')
            ->limit((int) $request->query('limit', 100))
            ->get();

        return GameResource::collection($games);
    }

    public function show(Game $game): GameResource
    {
        return $this->detailed($game);
    }

    public function store(Request $request, Competition $competition): GameResource
    {
        abort_unless($competition->isManagedBy($request->user()), 403, 'Vous ne gérez pas cette compétition.');
        abort_if($competition->isFinished(), 422, 'La compétition est terminée : rouvrez-la pour ajouter un match.');

        $game = $competition->games()->create($this->validateGame($request, $competition));

        return $this->detailed($game);
    }

    /**
     * Crée un match amical : chaque côté est une équipe existante ou une équipe rapide (nom + joueurs).
     */
    public function storeFriendly(Request $request): GameResource
    {
        $validated = $request->validate([
            'team_a.id' => ['nullable', 'integer', 'exists:teams,id'],
            'team_b.id' => ['nullable', 'integer', 'exists:teams,id', 'different:team_a.id'],
            'team_a.name' => ['required_without:team_a.id', 'nullable', 'string', 'max:80'],
            'team_b.name' => ['required_without:team_b.id', 'nullable', 'string', 'max:80'],
            'team_a.players' => ['required_without:team_a.id', 'array', 'min:'.Game::STARTERS, 'max:'.(Game::STARTERS + Game::MAX_SUBSTITUTES)],
            'team_b.players' => ['required_without:team_b.id', 'array', 'min:'.Game::STARTERS, 'max:'.(Game::STARTERS + Game::MAX_SUBSTITUTES)],
            'team_a.players.*' => ['required', 'string', 'max:60'],
            'team_b.players.*' => ['required', 'string', 'max:60'],
            'round' => ['nullable', 'string', 'max:60'],
            'scheduled_at' => ['nullable', 'date'],
            'start' => ['boolean'],
        ], [
            'team_a.name.required_without' => 'Donnez un nom à l’équipe A ou choisissez une équipe existante.',
            'team_b.name.required_without' => 'Donnez un nom à l’équipe B ou choisissez une équipe existante.',
            'team_a.players.required_without' => 'Ajoutez au moins un joueur à l’équipe A.',
            'team_b.players.required_without' => 'Ajoutez au moins un joueur à l’équipe B.',
            'team_a.players.min' => 'L’équipe A doit compter au moins 4 joueurs (4 titulaires).',
            'team_b.players.min' => 'L’équipe B doit compter au moins 4 joueurs (4 titulaires).',
            'team_a.players.max' => 'L’équipe A compte au plus 6 joueurs (4 titulaires + 2 remplaçants).',
            'team_b.players.max' => 'L’équipe B compte au plus 6 joueurs (4 titulaires + 2 remplaçants).',
            'team_b.id.different' => 'Choisissez deux équipes différentes.',
        ]);

        $user = $request->user();
        $start = $request->boolean('start');

        $game = DB::transaction(function () use ($validated, $user, $start) {
            [$teamA, $teamB] = array_map(function (array $side) use ($user) {
                if (! empty($side['id'])) {
                    return $side['id'];
                }
                $team = $user->teams()->create(['name' => trim($side['name'])]);
                foreach (array_values($side['players']) as $position => $name) {
                    $team->players()->create(['name' => trim($name), 'position' => $position]);
                }

                return $team->id;
            }, [$validated['team_a'], $validated['team_b']]);

            $game = Game::create([
                'owner_id' => $user->id,
                'team_a_id' => $teamA,
                'team_b_id' => $teamB,
                'round' => $validated['round'] ?? 'Match amical',
                'scheduled_at' => $validated['scheduled_at'] ?? ($start ? now() : null),
            ]);

            // Coup d'envoi immédiat : feuille de match figée et première mi-temps, comme un match démarré.
            if ($start) {
                $game->load(['teamA.players', 'teamB.players']);
                $game->lockLineups();
                $game->update(['status' => Game::STATUS_LIVE, 'phase' => Game::PHASE_FIRST_HALF, 'started_at' => now()]);
            }

            return $game;
        });

        return $this->detailed($game);
    }

    public function update(Request $request, Game $game): GameResource
    {
        $this->authorizeGame($request, $game);

        $validated = $this->validateGame($request, $game->competition, [
            'status' => ['sometimes', Rule::in([Game::STATUS_SCHEDULED, Game::STATUS_LIVE, Game::STATUS_FINISHED])],
        ]);
        $game->update($validated);

        return $this->detailed($game);
    }

    public function destroy(Request $request, Game $game): Response
    {
        $this->authorizeGame($request, $game);
        $game->delete();

        return response()->noContent();
    }

    public function start(Request $request, Game $game): GameResource
    {
        $this->authorizeGame($request, $game);
        $this->ensureCompetitionNotFinished($game);
        abort_if($game->status === Game::STATUS_LIVE, 422, 'Le match est déjà en cours.');

        $game->loadMissing(['teamA.players', 'teamB.players']);
        $game->lockLineups();

        $game->update([
            'status' => Game::STATUS_LIVE,
            // Un match rouvert reprend en seconde mi-temps.
            'phase' => $game->status === Game::STATUS_FINISHED ? Game::PHASE_SECOND_HALF : Game::PHASE_FIRST_HALF,
            'started_at' => $game->started_at ?? now(),
            'finished_at' => null,
        ]);

        return $this->detailed($game);
    }

    public function finish(Request $request, Game $game): GameResource
    {
        $this->authorizeGame($request, $game);
        abort_unless($game->status === Game::STATUS_LIVE, 422, 'Seul un match en cours peut être terminé.');
        abort_unless($game->phase === Game::PHASE_SECOND_HALF, 422, 'Le match se termine en seconde mi-temps : passez d’abord par la mi-temps.');

        $game->update(['status' => Game::STATUS_FINISHED, 'phase' => null, 'finished_at' => now()]);
        ResultSheet::capture($game);

        return $this->detailed($game);
    }

    public function score(Request $request, Game $game): GameResource
    {
        $this->authorizeGame($request, $game);
        $this->ensureCompetitionNotFinished($game);
        abort_unless($game->status === Game::STATUS_LIVE, 422, 'Démarrez le match avant de marquer des points.');
        abort_if($game->phase === Game::PHASE_HALFTIME, 422, 'C’est la mi-temps : reprenez le match pour marquer des points.');

        $rubrics = $game->competition?->rubrics()->get() ?? collect();

        $validated = $request->validate([
            'team_id' => ['required', 'integer', Rule::in([$game->team_a_id, $game->team_b_id])],
            'player_id' => ['nullable', 'integer', Rule::exists('players', 'id')->where('team_id', $request->input('team_id'))],
            // Quand la compétition a des rubriques, chaque point est rattaché à l'une d'elles.
            'rubric_id' => [$rubrics->isEmpty() ? 'prohibited' : 'required', 'integer', Rule::in($rubrics->pluck('id'))],
            'points' => ['required', 'integer'],
        ], [
            'rubric_id.required' => 'Choisissez la rubrique en cours.',
            'rubric_id.in' => 'Cette rubrique n’appartient pas à la compétition.',
        ]);

        if (! empty($validated['player_id'])) {
            $game->loadMissing(['teamA.players', 'teamB.players', 'sheet']);
            abort_unless($game->isOnField($validated['player_id']), 422, 'Ce joueur n’est pas sur le terrain.');
        }

        $rubric = $rubrics->firstWhere('id', $validated['rubric_id'] ?? null);
        $allowed = $game->allowedPoints($rubric);
        if (! in_array($validated['points'], $allowed, true)) {
            throw ValidationException::withMessages([
                'points' => 'Valeur hors barème. Valeurs autorisées : '.implode(', ', $allowed).'.',
            ]);
        }

        $game->events()->create([...$validated, 'user_id' => $request->user()->id]);
        $game->touch();

        return $this->detailed($game);
    }

    public function undo(Request $request, Game $game): GameResource
    {
        $this->authorizeGame($request, $game);
        abort_unless($game->status === Game::STATUS_LIVE, 422, 'Le match n’est pas en cours.');
        abort_if($game->phase === Game::PHASE_HALFTIME, 422, 'C’est la mi-temps : reprenez le match pour annuler un point.');

        $game->events()->latest('id')->first()?->delete();
        $game->touch();

        return $this->detailed($game);
    }

    /**
     * @param  array<string, mixed>  $extraRules
     */
    private function validateGame(Request $request, ?Competition $competition, array $extraRules = []): array
    {
        // Match amical : n'importe quelle équipe ; sinon, uniquement les équipes inscrites.
        $teamRule = $competition
            ? Rule::in($competition->teams()->pluck('teams.id')->all())
            : Rule::exists('teams', 'id');

        $validated = $request->validate([
            'team_a_id' => ['required', 'integer', $teamRule],
            'team_b_id' => ['required', 'integer', 'different:team_a_id', $teamRule],
            'group_id' => $competition
                ? ['nullable', 'integer', Rule::exists('competition_groups', 'id')->where('competition_id', $competition->id)]
                : ['prohibited'],
            'round' => ['nullable', 'string', 'max:60'],
            'scheduled_at' => ['nullable', 'date'],
            ...$extraRules,
        ], [
            'team_a_id.in' => 'L’équipe A doit être inscrite à la compétition.',
            'team_b_id.in' => 'L’équipe B doit être inscrite à la compétition.',
            'team_b_id.different' => 'Choisissez deux équipes différentes.',
            'group_id.exists' => 'Cette poule n’appartient pas à la compétition.',
        ]);

        // Un match de poule oppose deux équipes de cette poule.
        if (! empty($validated['group_id'])) {
            $inGroup = $competition->teams()->wherePivot('group_id', $validated['group_id'])
                ->whereIn('teams.id', [$validated['team_a_id'], $validated['team_b_id']])->count();

            if ($inGroup !== 2) {
                throw ValidationException::withMessages(['group_id' => 'Les deux équipes doivent appartenir à cette poule.']);
            }
        }

        return $validated;
    }

    private function ensureCompetitionNotFinished(Game $game): void
    {
        abort_if($game->competition?->isFinished(), 422, 'La compétition est terminée : rouvrez-la pour rejouer ce match.');
    }

    private function authorizeGame(Request $request, Game $game): void
    {
        abort_unless($game->isManagedBy($request->user()), 403, 'Vous ne gérez pas ce match.');
    }

    private function detailed(Game $game): GameResource
    {
        $game->load(['competition.rubrics', 'competition.owner', 'group', 'owner', 'teamA.players', 'teamB.players', 'events.player', 'events.rubric', 'sheet', 'resultSheet', 'substitutions.playerIn', 'substitutions.playerOut']);

        return (new GameResource($game))->detailed();
    }
}
