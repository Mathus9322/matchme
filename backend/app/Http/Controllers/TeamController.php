<?php

namespace App\Http\Controllers;

use App\Http\Resources\TeamResource;
use App\Models\Game;
use App\Models\Team;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;

class TeamController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $teams = Team::query()
            ->with('owner')
            ->withCount('players')
            ->when($request->boolean('mine'), fn ($q) => $q->where('owner_id', $request->user('sanctum')?->id ?? 0))
            ->when($request->query('search'), fn ($q, $search) => $q->where('name', 'like', "%{$search}%"))
            ->orderBy('name')
            ->get();

        return TeamResource::collection($teams);
    }

    public function show(Team $team): TeamResource
    {
        return new TeamResource($team->load(['owner', 'players']));
    }

    public function store(Request $request): TeamResource
    {
        $validated = $this->validateTeam($request);

        $team = DB::transaction(function () use ($request, $validated) {
            $team = $request->user()->teams()->create($validated);
            $this->syncPlayers($team, $validated['players']);

            return $team;
        });

        return new TeamResource($team->load(['owner', 'players']));
    }

    public function update(Request $request, Team $team): TeamResource
    {
        $this->authorizeTeam($request, $team);
        $validated = $this->validateTeam($request);

        DB::transaction(function () use ($team, $validated) {
            $team->update($validated);
            $this->syncPlayers($team, $validated['players']);
        });

        return new TeamResource($team->load(['owner', 'players']));
    }

    public function destroy(Request $request, Team $team): Response
    {
        $this->authorizeTeam($request, $team);
        $team->delete();

        return response()->noContent();
    }

    private function validateTeam(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:80'],
            'city' => ['nullable', 'string', 'max:80'],
            'players' => ['required', 'array', 'min:'.Game::STARTERS, 'max:12'],
            'players.*.id' => ['nullable', 'integer'],
            'players.*.name' => ['required', 'string', 'max:60'],
        ], [
            'players.required' => 'Ajoutez au moins un joueur.',
            'players.min' => 'Une équipe compte au moins 4 joueurs (les 4 titulaires d’un match).',
        ]);
    }

    /**
     * Met à jour les joueurs existants, crée les nouveaux et supprime ceux retirés.
     *
     * @param  list<array{id?: int|null, name: string}>  $players
     */
    private function syncPlayers(Team $team, array $players): void
    {
        $keptIds = [];

        foreach (array_values($players) as $position => $data) {
            $player = isset($data['id']) ? $team->players()->find($data['id']) : null;
            $attributes = ['name' => trim($data['name']), 'position' => $position];

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
        $user = $request->user();
        abort_unless($user->isAdmin() || $user->id === $team->owner_id, 403, 'Vous ne pouvez pas modifier cette équipe.');
    }
}
