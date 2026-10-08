<?php

namespace App\Http\Controllers;

use App\Http\Resources\TeamResource;
use App\Models\Game;
use App\Models\Team;
use App\Notifications\CoachAssigned;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;

class TeamController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $teams = Team::query()
            ->with(['owner', 'coach'])
            ->withCount('players')
            ->when($request->boolean('mine'), fn ($q) => $request->user('sanctum') ? $q->managedBy($request->user('sanctum')) : $q->whereRaw('0 = 1'))
            ->when($request->query('search'), fn ($q, $search) => $q->where('name', 'like', "%{$search}%"))
            ->orderBy('name')
            ->get();

        return TeamResource::collection($teams);
    }

    public function show(Team $team): TeamResource
    {
        return new TeamResource($team->load(['owner', 'coach', 'players']));
    }

    public function store(Request $request): TeamResource
    {
        $validated = $this->validateTeam($request, coachRequired: true);

        $team = DB::transaction(function () use ($request, $validated) {
            $team = $request->user()->teams()->create($validated);
            $this->syncPlayers($team, $validated['players'], $validated['captain']);

            return $team;
        });
        $this->notifyCoach($team);

        return new TeamResource($team->load(['owner', 'coach', 'players']));
    }

    public function update(Request $request, Team $team): TeamResource
    {
        $this->authorizeTeam($request, $team);
        $validated = $this->validateTeam($request, coachRequired: false);

        // Seul un manager qui a autorité sur l'équipe (créateur, organisateur d'une de ses compétitions, admin) désigne le coach.
        if (isset($validated['coach_id']) && (int) $validated['coach_id'] !== $team->coach_id) {
            abort_unless($team->isControlledBy($request->user()), 403, 'Seul le manager de l’équipe peut changer son coach.');
        }

        $coachChanged = DB::transaction(function () use ($team, $validated) {
            $team->update($validated);
            $this->syncPlayers($team, $validated['players'], $validated['captain']);

            return $team->wasChanged('coach_id');
        });
        if ($coachChanged) {
            $this->notifyCoach($team);
        }

        return new TeamResource($team->load(['owner', 'coach', 'players']));
    }

    public function destroy(Request $request, Team $team): Response
    {
        $user = $request->user();
        abort_unless($user->isAdmin() || $user->id === $team->owner_id, 403, 'Seul le manager de l’équipe peut la supprimer.');
        $team->delete();

        return response()->noContent();
    }

    private function validateTeam(Request $request, bool $coachRequired): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:80'],
            'city' => ['nullable', 'string', 'max:80'],
            'coach_id' => [$coachRequired ? 'required' : 'sometimes', 'integer', 'exists:users,id'],
            'players' => ['required', 'array', 'min:'.Game::STARTERS, 'max:12'],
            'players.*.id' => ['nullable', 'integer'],
            'players.*.name' => ['required', 'string', 'max:60'],
            'captain' => ['required', 'integer', 'min:0', 'max:'.max(0, count((array) $request->input('players', [])) - 1)],
        ], [
            'coach_id.required' => 'Désignez le coach de l’équipe.',
            'coach_id.exists' => 'Ce coach n’existe pas.',
            'captain.required' => 'Désignez le capitaine de l’équipe.',
            'captain.*' => 'Le capitaine doit être un joueur de l’équipe.',
            'players.required' => 'Ajoutez au moins un joueur.',
            'players.min' => 'Une équipe compte au moins 4 joueurs (les 4 titulaires d’un match).',
        ]);
    }

    /**
     * Met à jour les joueurs existants, crée les nouveaux et supprime ceux retirés.
     *
     * Le joueur d'indice $captain devient l'unique capitaine.
     *
     * @param  list<array{id?: int|null, name: string}>  $players
     */
    private function syncPlayers(Team $team, array $players, int $captain): void
    {
        $keptIds = [];

        foreach (array_values($players) as $position => $data) {
            $player = isset($data['id']) ? $team->players()->find($data['id']) : null;
            $attributes = ['name' => trim($data['name']), 'position' => $position, 'is_captain' => $position === $captain];

            if ($player) {
                $player->update($attributes);
            } else {
                $player = $team->players()->create($attributes);
            }

            $keptIds[] = $player->id;
        }

        // Suppression modèle par modèle pour retirer aussi les photos.
        $team->players()->whereNotIn('id', $keptIds)->get()->each->delete();
    }

    private function authorizeTeam(Request $request, Team $team): void
    {
        abort_unless($team->isManagedBy($request->user()), 403, 'Vous ne pouvez pas modifier cette équipe.');
    }

    /** Prévient le coach qu'il prend en charge l'équipe (sauf s'il l'a créée lui-même). */
    private function notifyCoach(Team $team): void
    {
        $coach = $team->coach;
        if ($coach && $coach->id !== $team->owner_id) {
            $coach->notify(new CoachAssigned($team));
        }
    }
}
