<?php

namespace App\Http\Controllers;

use App\Models\Competition;
use App\Models\CompetitionGroup;
use App\Models\Team;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class CompetitionGroupController extends Controller
{
    public function store(Request $request, Competition $competition): JsonResponse
    {
        $this->authorizeCompetition($request, $competition);
        $validated = $request->validate(['name' => ['nullable', 'string', 'max:40']]);

        $position = $competition->groups()->count();
        $group = $competition->groups()->create([
            'name' => $validated['name'] ?? 'Poule '.CompetitionGroup::letter($position),
            'position' => $position,
        ]);

        return response()->json(['data' => ['id' => $group->id, 'name' => $group->name]], 201);
    }

    public function update(Request $request, CompetitionGroup $group): Response
    {
        $this->authorizeCompetition($request, $group->competition);
        $group->update($request->validate(['name' => ['required', 'string', 'max:40']]));

        return response()->noContent();
    }

    /** Supprime la poule : ses équipes et ses matchs restent dans la compétition, sans poule. */
    public function destroy(Request $request, CompetitionGroup $group): Response
    {
        $this->authorizeCompetition($request, $group->competition);
        $group->delete();

        return response()->noContent();
    }

    public function assignTeam(Request $request, Competition $competition, Team $team): Response
    {
        $this->authorizeCompetition($request, $competition);
        abort_unless($competition->teams()->whereKey($team->id)->exists(), 404, 'Équipe non inscrite à cette compétition.');

        $validated = $request->validate([
            'group_id' => ['nullable', 'integer', Rule::exists('competition_groups', 'id')->where('competition_id', $competition->id)],
        ]);

        $competition->teams()->updateExistingPivot($team->id, ['group_id' => $validated['group_id'] ?? null]);

        return response()->noContent();
    }

    /**
     * Tirage au sort : recrée N poules (A, B, …) et y répartit les équipes au hasard, de façon équilibrée.
     */
    public function draw(Request $request, Competition $competition): Response
    {
        $this->authorizeCompetition($request, $competition);
        abort_if($competition->format === Competition::FORMAT_LEAGUE, 422, 'Un championnat ne se joue pas en poules.');
        $teamCount = $competition->teams()->count();

        $validated = $request->validate([
            'count' => ['required', 'integer', 'min:1', 'max:'.max(1, min(26, $teamCount))],
        ], [
            'count.max' => 'Il ne peut pas y avoir plus de poules que d’équipes inscrites.',
        ]);

        abort_if(
            $competition->games()->whereNotNull('group_id')->where('status', '!=', 'scheduled')->exists(),
            422,
            'Des matchs de poule ont déjà commencé : le tirage ne peut plus être refait.',
        );

        DB::transaction(function () use ($competition, $validated) {
            // Les matchs de poule non joués sont obsolètes après un nouveau tirage.
            $competition->games()->whereNotNull('group_id')->delete();
            $competition->groups()->delete();

            $groups = collect(range(0, $validated['count'] - 1))->map(fn ($i) => $competition->groups()->create([
                'name' => 'Poule '.CompetitionGroup::letter($i),
                'position' => $i,
            ]));

            $competition->teams()->pluck('teams.id')->shuffle()->values()->each(
                fn ($teamId, $i) => $competition->teams()->updateExistingPivot($teamId, ['group_id' => $groups[$i % $groups->count()]->id]),
            );
        });

        return response()->noContent();
    }

    /**
     * Génère les matchs « chacun contre chacun » de la poule qui n'existent pas encore.
     */
    public function schedule(Request $request, CompetitionGroup $group): JsonResponse
    {
        $competition = $group->competition;
        $this->authorizeCompetition($request, $competition);

        $teamIds = $group->teams()->pluck('teams.id')->values();
        abort_if($teamIds->count() < 2, 422, 'Il faut au moins deux équipes dans la poule.');

        $existing = $group->games()->get(['team_a_id', 'team_b_id'])
            ->map(fn ($game) => collect([$game->team_a_id, $game->team_b_id])->sort()->implode('-'))
            ->flip();

        $created = 0;
        foreach ($teamIds as $i => $a) {
            foreach ($teamIds->slice($i + 1) as $b) {
                if ($existing->has(collect([$a, $b])->sort()->implode('-'))) {
                    continue;
                }
                $competition->games()->create(['group_id' => $group->id, 'team_a_id' => $a, 'team_b_id' => $b, 'round' => $group->name]);
                $created++;
            }
        }

        return response()->json(['created' => $created]);
    }

    private function authorizeCompetition(Request $request, Competition $competition): void
    {
        abort_unless($competition->isManagedBy($request->user()), 403, 'Vous ne gérez pas cette compétition.');
    }
}
