<?php

namespace App\Http\Controllers;

use App\Http\Resources\GameResource;
use App\Models\Competition;
use App\Models\Game;
use App\Models\Team;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Tableau de bord de l'espace de gestion. */
class ManageController extends Controller
{
    public function overview(Request $request): JsonResponse
    {
        $user = $request->user();
        $all = $user->isAdmin();

        $competitions = Competition::query()->unless($all, fn ($q) => $q->where('owner_id', $user->id));
        $teams = Team::query()->unless($all, fn ($q) => $q->where('owner_id', $user->id));
        $teamIds = (clone $teams)->pluck('id');

        // Matchs qui me concernent : mes compétitions, mes amicaux, ou ceux de mes équipes.
        $mine = fn (Builder $q) => $all ? $q : $q->where(fn ($q) => $q
            ->whereIn('competition_id', (clone $competitions)->select('id'))
            ->orWhere('owner_id', $user->id)
            ->orWhereIn('team_a_id', $teamIds)
            ->orWhereIn('team_b_id', $teamIds));

        $games = fn () => Game::query()->with(['competition', 'group', 'teamA', 'teamB'])->withScores()->tap($mine);

        return response()->json([
            'stats' => [
                'competitions' => (clone $competitions)->count(),
                'ongoing_competitions' => (clone $competitions)->where('status', Competition::STATUS_ONGOING)->count(),
                'teams' => $teamIds->count(),
                'live_games' => $games()->where('status', Game::STATUS_LIVE)->count(),
                'scheduled_games' => $games()->where('status', Game::STATUS_SCHEDULED)->count(),
                'finished_games' => $games()->where('status', Game::STATUS_FINISHED)->count(),
            ],
            'live' => GameResource::collection($games()->where('status', Game::STATUS_LIVE)->latest('started_at')->limit(10)->get()),
            'upcoming' => GameResource::collection($games()->where('status', Game::STATUS_SCHEDULED)->orderByRaw('scheduled_at is null')->orderBy('scheduled_at')->limit(8)->get()),
            'recent' => GameResource::collection($games()->where('status', Game::STATUS_FINISHED)->latest('finished_at')->limit(6)->get()),
        ]);
    }
}
