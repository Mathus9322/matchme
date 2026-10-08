<?php

namespace App\Http\Controllers;

use App\Http\Resources\GameResource;
use App\Models\Game;
use App\Models\Team;
use App\Support\TeamStatistics;
use Illuminate\Http\JsonResponse;

/** Statistiques importées pour un match : bilan des deux équipes, joueurs et face-à-face. */
class MatchupController extends Controller
{
    public function __construct(private readonly TeamStatistics $stats) {}

    public function show(Game $game): JsonResponse
    {
        $game->load(['teamA.players', 'teamB.players']);
        $side = function (Team $team) {
            $games = $this->stats->finishedGames($team);

            return [
                'id' => $team->id,
                'name' => $team->name,
                'logo_url' => $team->imageUrl(),
                ...$this->stats->record($team, $games),
                'players' => $this->stats->players($team, $games),
            ];
        };

        // Rencontres déjà jouées entre les deux équipes (hors match en cours).
        $meetings = Game::query()->with(['competition', 'group', 'teamA', 'teamB'])->withScores()
            ->where('status', Game::STATUS_FINISHED)
            ->whereKeyNot($game->id)
            ->where(fn ($q) => $q
                ->where(fn ($q) => $q->where('team_a_id', $game->team_a_id)->where('team_b_id', $game->team_b_id))
                ->orWhere(fn ($q) => $q->where('team_a_id', $game->team_b_id)->where('team_b_id', $game->team_a_id)))
            ->latest('finished_at')
            ->get();

        $winsA = $meetings->filter(fn ($m) => ($m->team_a_id === $game->team_a_id ? $m->score_a <=> $m->score_b : $m->score_b <=> $m->score_a) > 0)->count();
        $draws = $meetings->filter(fn ($m) => $m->score_a === $m->score_b)->count();

        return response()->json(['data' => [
            'team_a' => $side($game->teamA),
            'team_b' => $side($game->teamB),
            'head_to_head' => [
                'played' => $meetings->count(),
                'wins_a' => $winsA,
                'draws' => $draws,
                'wins_b' => $meetings->count() - $winsA - $draws,
                'meetings' => GameResource::collection($meetings->take(5)),
            ],
        ]]);
    }
}
