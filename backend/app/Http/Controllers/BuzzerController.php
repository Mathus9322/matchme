<?php

namespace App\Http\Controllers;

use App\Models\BuzzerDevice;
use App\Models\Game;
use App\Models\Player;
use App\Support\Buzzer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * Multibuzzer. Côté arbitre (manager du match) : code, ouverture, jugement.
 * Côté joueurs : pas de compte, un code de match puis un jeton par téléphone.
 * Le public ne voit jamais le buzzer.
 */
class BuzzerController extends Controller
{
    public function __construct(private readonly Buzzer $buzzer) {}

    // ---- Arbitre -------------------------------------------------------------------------

    public function show(Request $request, Game $game): JsonResponse
    {
        $this->authorizeReferee($request, $game);
        $this->buzzer->ensureCode($game);

        return $this->refereeState($game);
    }

    /** Avant le coup d'envoi, l'arbitre choisit de jouer avec ou sans buzzer. */
    public function mode(Request $request, Game $game): JsonResponse
    {
        $this->authorizeReferee($request, $game);
        abort_unless($game->status === Game::STATUS_SCHEDULED, 422, 'Le mode buzzer se choisit avant le coup d’envoi.');
        $validated = $request->validate(['uses_buzzer' => ['required', 'boolean']]);

        $game->update(['uses_buzzer' => $validated['uses_buzzer']]);
        if (! $game->uses_buzzer) {
            // Sans buzzer, les téléphones reliés sont déconnectés.
            BuzzerDevice::where('game_id', $game->id)->delete();
        }

        return $this->refereeState($game);
    }

    public function regenerate(Request $request, Game $game): JsonResponse
    {
        $this->authorizeReferee($request, $game);
        $this->buzzer->ensureCode($game, regenerate: true);
        $this->buzzer->announce($game);

        return $this->refereeState($game);
    }

    public function open(Request $request, Game $game): JsonResponse
    {
        $this->authorizeReferee($request, $game);
        abort_unless($game->uses_buzzer, 422, 'Ce match se joue sans buzzer.');
        abort_unless($game->isInPlay(), 422, 'Les buzzers s’ouvrent uniquement pendant le jeu.');
        $this->buzzer->ensureCode($game);
        $this->buzzer->open($game);

        return $this->refereeState($game);
    }

    public function close(Request $request, Game $game): JsonResponse
    {
        $this->authorizeReferee($request, $game);
        $this->buzzer->close($game);

        return $this->refereeState($game);
    }

    public function judge(Request $request, Game $game): JsonResponse
    {
        $this->authorizeReferee($request, $game);
        $validated = $request->validate(['result' => ['required', 'in:correct,wrong,passed']]);
        $this->buzzer->judge($game, $validated['result']);

        return $this->refereeState($game);
    }

    /** Libère le nom d'un joueur (téléphone perdu, mauvais nom choisi…). */
    public function release(Request $request, Game $game, Player $player): JsonResponse
    {
        $this->authorizeReferee($request, $game);
        BuzzerDevice::where('game_id', $game->id)->where('player_id', $player->id)->delete();

        return $this->refereeState($game);
    }

    // ---- Joueurs ---------------------------------------------------------------------------

    /** Étape 1 : le code du match donne la liste des joueurs de la feuille de match. */
    public function join(Request $request): JsonResponse
    {
        $game = $this->gameByCode($request);
        $taken = BuzzerDevice::where('game_id', $game->id)->pluck('player_id');
        $game->load(['teamA.players', 'teamB.players', 'sheet']);

        return response()->json(['data' => [
            'game' => $this->title($game),
            'teams' => collect([$game->teamA, $game->teamB])->map(fn ($team) => [
                'id' => $team->id,
                'name' => $team->name,
                'players' => $game->lineupFor($team)->map(fn ($row) => [
                    'id' => $row['player']->id,
                    'name' => $row['player']->name,
                    'on_field' => $row['on_field'],
                    'taken' => $taken->contains($row['player']->id),
                ])->values(),
            ])->values(),
        ]]);
    }

    /** Étape 2 : le joueur choisit son nom ; son téléphone reçoit un jeton secret. */
    public function claim(Request $request): JsonResponse
    {
        $game = $this->gameByCode($request);
        $game->load(['teamA.players', 'teamB.players', 'sheet']);
        $validated = $request->validate(['player_id' => ['required', 'integer']]);

        $onSheet = collect([$game->teamA, $game->teamB])
            ->flatMap(fn ($team) => $game->lineupFor($team)->pluck('player.id'))
            ->contains($validated['player_id']);
        abort_unless($onSheet, 422, 'Ce joueur n’est pas sur la feuille de match.');
        abort_if(
            BuzzerDevice::where('game_id', $game->id)->where('player_id', $validated['player_id'])->exists(),
            409,
            'Ce nom est déjà utilisé sur un autre téléphone. Demandez à l’arbitre de le libérer.',
        );

        $token = Str::random(48);
        BuzzerDevice::create(['game_id' => $game->id, 'player_id' => $validated['player_id'], 'token_hash' => hash('sha256', $token), 'last_seen_at' => now()]);

        return response()->json(['token' => $token, 'data' => $this->playerState($this->device($token))], 201);
    }

    public function state(Request $request): JsonResponse
    {
        $device = $this->device($request->header('X-Buzzer-Token'));
        $device->forceFill(['last_seen_at' => now()])->saveQuietly();

        return response()->json(['data' => $this->playerState($device)]);
    }

    public function buzz(Request $request): JsonResponse
    {
        $device = $this->device($request->header('X-Buzzer-Token'));
        $won = $this->buzzer->buzz($device->game, $device->player);
        $device->game->refresh();

        return response()->json(['won' => $won, 'data' => $this->playerState($device)]);
    }

    public function leave(Request $request): JsonResponse
    {
        $this->device($request->header('X-Buzzer-Token'))->delete();

        return response()->json(status: 204);
    }

    // ---- Interne ---------------------------------------------------------------------------

    private function authorizeReferee(Request $request, Game $game): void
    {
        abort_unless($game->isManagedBy($request->user()), 403, 'Seul l’arbitre du match gère le buzzer.');
    }

    private function gameByCode(Request $request): Game
    {
        $code = preg_replace('/\D/', '', (string) $request->input('code'));
        $game = strlen($code) === 6 ? Game::where('buzzer_code', $code)->first() : null;
        abort_unless($game && $game->uses_buzzer, 404, 'Code inconnu. Vérifiez le code affiché par l’arbitre.');
        abort_if($game->status === Game::STATUS_FINISHED, 422, 'Ce match est terminé.');

        return $game;
    }

    private function device(?string $token): BuzzerDevice
    {
        $device = BuzzerDevice::findByToken($token);
        abort_unless($device, 401, 'Ce téléphone n’est plus relié au buzzer. Rejoignez le match avec son code.');

        return $device;
    }

    private function title(Game $game): array
    {
        return ['id' => $game->id, 'title' => "{$game->teamA->name} – {$game->teamB->name}", 'round' => $game->round];
    }

    private function realtime(Game $game): array
    {
        return ['channel' => 'buzzer.'.$game->buzzer_channel, 'event' => '.buzzer.updated', 'key' => config('broadcasting.connections.reverb.key')];
    }

    private function playerState(BuzzerDevice $device): array
    {
        $game = $device->game->load(['teamA', 'teamB']);
        $player = $device->player;

        return [
            ...$this->buzzer->state($game),
            'game' => $this->title($game),
            'me' => ['player_id' => $player->id, 'name' => $player->name, 'team_id' => $player->team_id, 'team' => $player->team->name, 'is_captain' => $player->is_captain],
            'realtime' => $this->realtime($game),
        ];
    }

    private function refereeState(Game $game): JsonResponse
    {
        $game->refresh()->load(['teamA.players', 'teamB.players', 'sheet']);
        $devices = BuzzerDevice::where('game_id', $game->id)->get()->keyBy('player_id');

        return response()->json(['data' => [
            ...$this->buzzer->state($game),
            'code' => $game->buzzer_code,
            'uses_buzzer' => $game->uses_buzzer,
            'realtime' => $this->realtime($game),
            'players' => collect([$game->teamA, $game->teamB])->flatMap(fn ($team) => $game->lineupFor($team)->map(fn ($row) => [
                'id' => $row['player']->id,
                'name' => $row['player']->name,
                'team_id' => $team->id,
                'on_field' => $row['on_field'],
                'connected' => $devices->has($row['player']->id),
                // Vu dans la dernière minute (le téléphone interroge le serveur régulièrement).
                'online' => (bool) $devices->get($row['player']->id)?->last_seen_at?->gt(now()->subMinute()),
            ]))->values(),
        ]]);
    }
}
