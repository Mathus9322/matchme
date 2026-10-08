<?php

namespace App\Http\Controllers;

use App\Http\Resources\CompetitionResource;
use App\Models\Competition;
use App\Models\Game;
use App\Models\Team;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;

class CompetitionController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $competitions = Competition::query()
            ->with('owner')
            ->withCount(['teams', 'games'])
            ->when($request->boolean('mine'), fn ($q) => $q->where('owner_id', $request->user('sanctum')?->id ?? 0))
            ->when($request->query('status'), fn ($q, $status) => $q->where('status', $status))
            ->latest()
            ->get();

        return CompetitionResource::collection($competitions);
    }

    public function show(Competition $competition): JsonResponse
    {
        $competition->load([
            'owner',
            'groups',
            'rubrics',
            'teams' => fn ($q) => $q->withCount('players'),
            'games' => fn ($q) => $q->with(['teamA', 'teamB', 'group'])->withScores()->orderByRaw('scheduled_at is null')->orderBy('scheduled_at')->orderBy('id'),
        ]);

        return (new CompetitionResource($competition))
            ->additional([
                'standings' => $competition->standings(),
                'group_standings' => $competition->groupStandings(),
            ])
            ->response();
    }

    public function store(Request $request): CompetitionResource
    {
        abort_unless($request->user()->canOrganize(), 403, 'Seuls les managers peuvent créer une compétition.');

        $competition = $request->user()->competitions()->create($this->validateCompetition($request));

        return new CompetitionResource($competition->load('owner'));
    }

    public function update(Request $request, Competition $competition): CompetitionResource
    {
        $this->authorizeCompetition($request, $competition);
        $competition->update($this->validateCompetition($request));

        return new CompetitionResource($competition->load('owner'));
    }

    public function destroy(Request $request, Competition $competition): Response
    {
        $this->authorizeCompetition($request, $competition);
        $competition->delete();

        return response()->noContent();
    }

    /**
     * Inscrit une ou plusieurs équipes. L'organisateur peut inscrire n'importe quelle équipe ;
     * un propriétaire d'équipe peut inscrire les siennes tant que les inscriptions sont ouvertes.
     */
    public function attachTeam(Request $request, Competition $competition): JsonResponse
    {
        $validated = $request->validate([
            'team_ids' => ['required_without:team_id', 'array', 'min:1', 'max:100'],
            'team_ids.*' => ['integer', 'distinct', 'exists:teams,id'],
            'team_id' => ['nullable', 'integer', 'exists:teams,id'],
        ], [
            'team_ids.required_without' => 'Sélectionnez au moins une équipe.',
        ]);

        $teams = Team::findMany($validated['team_ids'] ?? [$validated['team_id']]);
        $teams->each(fn (Team $team) => $this->authorizeRegistration($request, $competition, $team));

        $attached = $competition->teams()->syncWithoutDetaching($teams->pluck('id'))['attached'];

        return response()->json(['attached' => count($attached)]);
    }

    public function detachTeam(Request $request, Competition $competition, Team $team): Response
    {
        $this->authorizeRegistration($request, $competition, $team);

        abort_if(
            $competition->games()->where(fn ($q) => $q->where('team_a_id', $team->id)->orWhere('team_b_id', $team->id))->exists(),
            422,
            'Cette équipe a déjà des matchs dans la compétition.',
        );

        $competition->teams()->detach($team->id);

        return response()->noContent();
    }

    /** Lance la compétition : statut « En cours ». */
    public function publish(Request $request, Competition $competition): CompetitionResource
    {
        $this->authorizeCompetition($request, $competition);
        abort_if($competition->status === Competition::STATUS_ONGOING, 422, 'La compétition est déjà en cours.');
        abort_if($competition->isFinished(), 422, 'La compétition est terminée : utilisez « Rouvrir ».');
        abort_if($competition->teams()->count() < 2, 422, 'Inscrivez au moins deux équipes avant de publier la compétition.');

        $competition->update([
            'status' => Competition::STATUS_ONGOING,
            'starts_on' => $competition->starts_on ?? now()->toDateString(),
        ]);

        return new CompetitionResource($competition->load('owner'));
    }

    /** Clôture la compétition : statut « Terminée », plus aucun match ne peut être joué. */
    public function finish(Request $request, Competition $competition): CompetitionResource
    {
        $this->authorizeCompetition($request, $competition);
        abort_unless($competition->status === Competition::STATUS_ONGOING, 422, 'Seule une compétition en cours peut être terminée.');
        abort_if(
            $competition->games()->where('status', Game::STATUS_LIVE)->exists(),
            422,
            'Des matchs sont encore en direct : terminez-les avant de clôturer la compétition.',
        );

        $competition->update([
            'status' => Competition::STATUS_FINISHED,
            'ends_on' => $competition->ends_on ?? now()->toDateString(),
        ]);

        return new CompetitionResource($competition->load('owner'));
    }

    /** Annule une clôture faite par erreur. */
    public function reopen(Request $request, Competition $competition): CompetitionResource
    {
        $this->authorizeCompetition($request, $competition);
        abort_unless($competition->isFinished(), 422, 'La compétition n’est pas terminée.');

        $competition->update(['status' => Competition::STATUS_ONGOING]);

        return new CompetitionResource($competition->load('owner'));
    }

    private function validateCompetition(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'description' => ['nullable', 'string', 'max:2000'],
            'starts_on' => ['nullable', 'date'],
            'ends_on' => ['nullable', 'date', 'after_or_equal:starts_on'],
            'status' => ['required', Rule::in(Competition::STATUSES)],
            'format' => ['sometimes', Rule::in([Competition::FORMAT_GROUPS, Competition::FORMAT_LEAGUE])],
        ]);
    }

    private function authorizeCompetition(Request $request, Competition $competition): void
    {
        abort_unless($competition->isManagedBy($request->user()), 403, 'Vous ne gérez pas cette compétition.');
    }

    private function authorizeRegistration(Request $request, Competition $competition, Team $team): void
    {
        $user = $request->user();
        $ownsTeam = $user->id === $team->owner_id && $competition->status === 'open';

        abort_unless($competition->isManagedBy($user) || $ownsTeam, 403, 'Vous ne pouvez pas gérer les inscriptions de cette compétition.');
    }
}
