<?php

namespace App\Http\Controllers;

use App\Http\Resources\GameResource;
use App\Models\Competition;
use App\Models\Game;
use App\Models\GamePlayer;
use App\Models\ResultSheet;
use App\Models\Team;
use Illuminate\Http\JsonResponse;
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
            // Mes matchs : ceux que j'arbitre et ceux des équipes que je gère (manager ou coach).
            ->when($request->boolean('mine'), function ($q) use ($request) {
                $user = $request->user('sanctum');
                if (! $user) {
                    return $q->whereRaw('0 = 1');
                }
                $teamIds = Team::query()->managedBy($user)->select('id');
                $q->where(fn ($q) => $q->where('owner_id', $user->id)->orWhereIn('team_a_id', $teamIds)->orWhereIn('team_b_id', $teamIds));
            })
            ->orderByRaw("case status when 'live' then 0 when 'scheduled' then 1 else 2 end")
            ->orderBy('scheduled_at')
            ->latest('id')
            ->limit((int) $request->query('limit', 100))
            ->get();

        return GameResource::collection($games);
    }

    /** Code spectateur : renvoie le match correspondant (lettres en majuscules, espaces et tirets ignorés). */
    public function watch(string $code): JsonResponse
    {
        $code = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $code));
        $game = Game::where('watch_code', $code)->first();
        abort_unless($game, 404, 'Aucun match ne correspond à ce code.');

        return response()->json(['data' => ['id' => $game->id]]);
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
            'team_a.captain' => ['nullable', 'integer', 'min:0', 'max:'.max(0, count((array) $request->input('team_a.players', [])) - 1)],
            'team_b.captain' => ['nullable', 'integer', 'min:0', 'max:'.max(0, count((array) $request->input('team_b.players', [])) - 1)],
            'team_b.players.*' => ['required', 'string', 'max:60'],
            ...$this->friendlyLineupRules($request, 'team_a'),
            ...$this->friendlyLineupRules($request, 'team_b'),
            'round' => ['nullable', 'string', 'max:60'],
            'scheduled_at' => ['nullable', 'date'],
            'start' => ['boolean'],
            // Démarrage immédiat : le mode d'arbitrage doit être choisi.
            'uses_buzzer' => ['required_if_accepted:start', 'boolean'],
        ], [
            'uses_buzzer.required_if_accepted' => 'Choisissez de jouer avec ou sans buzzer avant de démarrer le match.',
            'team_a.starters.size' => 'Choisissez exactement 4 titulaires pour l’équipe A.',
            'team_b.starters.size' => 'Choisissez exactement 4 titulaires pour l’équipe B.',
            'team_a.substitutes.max' => 'L’équipe A compte au plus 2 remplaçants.',
            'team_b.substitutes.max' => 'L’équipe B compte au plus 2 remplaçants.',
            '*.starters.*.exists' => 'Ce joueur n’appartient pas à l’équipe.',
            '*.substitutes.*.exists' => 'Ce joueur n’appartient pas à l’équipe.',
            '*.substitutes.*.not_in' => 'Un joueur ne peut pas être à la fois titulaire et remplaçant.',
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

        // Match créé directement : uniquement avec ses propres équipes (ou des équipes rapides créées ici).
        // Pour affronter l'équipe d'un autre manager, on passe par une proposition de match amical.
        foreach (['team_a' => 'A', 'team_b' => 'B'] as $key => $label) {
            $teamId = $validated[$key]['id'] ?? null;
            if ($teamId && ! $user->isAdmin() && Team::whereKey($teamId)->value('owner_id') !== $user->id) {
                throw ValidationException::withMessages(["{$key}.id" => "L’équipe {$label} ne vous appartient pas : créez votre propre équipe, ou proposez un match à son coach."]);
            }
        }

        $game = DB::transaction(function () use ($validated, $user, $start) {
            [$teamA, $teamB] = array_map(function (array $side) use ($user) {
                if (! empty($side['id'])) {
                    return $side['id'];
                }
                $team = $user->teams()->create(['name' => trim($side['name'])]);
                foreach (array_values($side['players']) as $position => $name) {
                    // Capitaine désigné, sinon le premier joueur.
                    $team->players()->create(['name' => trim($name), 'position' => $position, 'is_captain' => $position === (int) ($side['captain'] ?? 0)]);
                }

                return $team->id;
            }, [$validated['team_a'], $validated['team_b']]);

            $game = Game::create([
                'owner_id' => $user->id,
                'team_a_id' => $teamA,
                'team_b_id' => $teamB,
                'round' => $validated['round'] ?? 'Match amical',
                'scheduled_at' => $validated['scheduled_at'] ?? ($start ? now() : null),
                'uses_buzzer' => (bool) ($validated['uses_buzzer'] ?? false),
            ]);

            // Feuille de match composée à la création pour les équipes existantes (titulaires puis remplaçants).
            foreach (['team_a' => $teamA, 'team_b' => $teamB] as $key => $teamId) {
                $side = $validated[$key];
                if (empty($side['id']) || empty($side['starters'])) {
                    continue;
                }
                $team = Team::with('players')->find($teamId);
                $captain = $team->captainId();
                if ($captain !== null && ! in_array($captain, $side['starters'], true)) {
                    throw ValidationException::withMessages(["{$key}.starters" => "Le capitaine de « {$team->name} » doit être titulaire : il joue toujours en première position."]);
                }
                $side['starters'] = $team->captainFirst($side['starters']);
                $position = 0;
                foreach (['starters' => GamePlayer::ROLE_STARTER, 'substitutes' => GamePlayer::ROLE_SUBSTITUTE] as $list => $role) {
                    foreach ($side[$list] ?? [] as $playerId) {
                        $game->sheet()->create([
                            'team_id' => $teamId,
                            'player_id' => $playerId,
                            'role' => $role,
                            'on_field' => $role === GamePlayer::ROLE_STARTER,
                            'position' => $position++,
                        ]);
                    }
                }
            }

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

    /** Composition facultative d'une équipe existante : 4 titulaires et jusqu'à 2 remplaçants, choisis dans son effectif. */
    private function friendlyLineupRules(Request $request, string $side): array
    {
        $playerRule = Rule::exists('players', 'id')->where('team_id', (int) $request->input("{$side}.id"));

        return [
            "{$side}.starters" => ['nullable', 'array', 'size:'.Game::STARTERS],
            "{$side}.starters.*" => ['integer', 'distinct', $playerRule],
            "{$side}.substitutes" => ['nullable', 'array', 'max:'.Game::MAX_SUBSTITUTES],
            "{$side}.substitutes.*" => ['integer', 'distinct', 'not_in:'.implode(',', (array) $request->input("{$side}.starters", [])), $playerRule],
        ];
    }

    /** Change la rubrique en cours : réservé au manager du match, uniquement pendant le jeu. */
    public function rubric(Request $request, Game $game): GameResource
    {
        abort_unless($game->isManagedBy($request->user()), 403, 'Seul le manager du match fait avancer les rubriques.');
        abort_unless($game->isInPlay(), 422, 'Les rubriques avancent uniquement pendant le jeu.');

        $rubrics = $game->competition?->rubrics ?? collect();
        $validated = $request->validate(
            ['rubric_id' => ['required', 'integer', Rule::in($rubrics->pluck('id'))]],
            ['rubric_id.in' => 'Cette rubrique n’appartient pas à la compétition.'],
        );
        $game->update(['current_rubric_id' => $validated['rubric_id']]);

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
        // Toujours choisir, au coup d'envoi comme à la réouverture : avec ou sans buzzer.
        $validated = $request->validate(
            ['uses_buzzer' => ['required', 'boolean']],
            ['uses_buzzer.required' => 'Choisissez de jouer avec ou sans buzzer avant de démarrer le match.'],
        );

        $game->loadMissing(['teamA.players', 'teamB.players']);
        $game->lockLineups();

        $game->update([
            'uses_buzzer' => $validated['uses_buzzer'],
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
            // L'interface envoie toujours rubric_id (null sans rubrique) : null est accepté quand il n'y a pas de rubriques.
            'rubric_id' => $rubrics->isEmpty() ? ['nullable', 'prohibited'] : ['required', 'integer', Rule::in($rubrics->pluck('id'))],
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

        // Le point est rattaché à la question affichée au public, s'il y en a une.
        $game->events()->create([...$validated, 'question_id' => $game->current_question_id, 'user_id' => $request->user()->id]);
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
        $game->load(GameResource::DETAIL_RELATIONS);

        return (new GameResource($game))->detailed();
    }
}
