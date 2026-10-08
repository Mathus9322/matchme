<?php

namespace App\Http\Controllers;

use App\Http\Resources\GameResource;
use App\Models\Game;
use App\Models\Player;
use App\Models\Team;
use App\Support\TeamStatistics;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Collection;

/** Fiches publiques : statistiques d'une équipe et de ses joueurs. */
class TeamStatsController extends Controller
{
    public function __construct(private readonly TeamStatistics $stats) {}

    public function team(Team $team): JsonResponse
    {
        $team->load(['owner', 'coach', 'players', 'competitions']);
        $finished = $this->stats->finishedGames($team);
        ['record' => $record, 'form' => $form] = $this->stats->record($team, $finished);
        $players = $this->stats->players($team, $finished);

        $upcoming = Game::query()->with(['competition', 'group', 'teamA', 'teamB'])->withScores()
            ->where(fn ($q) => $q->where('team_a_id', $team->id)->orWhere('team_b_id', $team->id))
            ->whereIn('status', [Game::STATUS_LIVE, Game::STATUS_SCHEDULED])
            ->orderByRaw("case status when 'live' then 0 else 1 end")->orderByRaw('scheduled_at is null')->orderBy('scheduled_at')
            ->limit(5)->get();

        return response()->json(['data' => [
            'team' => [
                'id' => $team->id,
                'name' => $team->name,
                'city' => $team->city,
                'logo_url' => $team->imageUrl(),
                'owner' => $team->owner?->summary(),
                'coach' => $team->coach?->summary(),
                'can_manage' => $team->isManagedBy(request()->user('sanctum')),
                'competitions' => $team->competitions->map(fn ($c) => ['id' => $c->id, 'name' => $c->name, 'status' => $c->status])->values(),
            ],
            'record' => $record,
            // Forme : du plus récent au plus ancien.
            'form' => $form,
            'players' => $players,
            'top_scorer' => $players->first(fn ($p) => $p['points'] > 0),
            'recent' => GameResource::collection($finished->reverse()->take(8)->values()),
            'upcoming' => GameResource::collection($upcoming),
        ]]);
    }

    public function player(Player $player): JsonResponse
    {
        $team = $player->team()->with('players')->firstOrFail();
        $finished = $this->stats->finishedGames($team);
        $events = $player->events()->with('rubric')->whereIn('game_id', $finished->pluck('id'))->get();

        $matches = $finished->reverse()->map(function (Game $game) use ($player, $team, $events) {
            $row = $game->lineupFor($team)->first(fn ($r) => $r['player']->id === $player->id);
            $mine = $events->where('game_id', $game->id);
            if (! $this->stats->played($game, $team, $player) && $mine->isEmpty()) {
                return null;
            }
            $home = $game->team_a_id === $team->id;
            [$for, $against] = $home ? [$game->score_a, $game->score_b] : [$game->score_b, $game->score_a];

            return [
                'game_id' => $game->id,
                'date' => $game->finished_at ?? $game->scheduled_at,
                'competition' => $game->competition?->name ?? 'Match amical',
                'round' => $game->round,
                'opponent' => ($home ? $game->teamB : $game->teamA)?->name,
                'score' => "{$for} – {$against}",
                'result' => [-1 => 'D', 0 => 'N', 1 => 'V'][$for <=> $against],
                'role' => $row['role'] ?? null,
                'points' => (int) $mine->sum('points'),
                'answers' => $mine->where('points', '>', 0)->count(),
                'penalties' => $mine->where('points', '<', 0)->count(),
            ];
        })->filter()->values();

        $rubrics = $events->whereNotNull('rubric_id')->groupBy(fn ($e) => $e->rubric->name)
            ->map(fn (Collection $e, $name) => ['name' => $name, 'points' => (int) $e->sum('points'), 'answers' => $e->where('points', '>', 0)->count()])
            ->sortByDesc('points')->values();

        return response()->json(['data' => [
            'player' => ['id' => $player->id, 'name' => $player->name, 'photo_url' => $player->imageUrl()],
            'team' => ['id' => $team->id, 'name' => $team->name, 'logo_url' => $team->imageUrl()],
            ...$this->stats->playerTotals($player, $team, $finished),
            'best' => $matches->sortByDesc('points')->first(fn ($m) => $m['points'] > 0),
            'rubrics' => $rubrics,
            'matches' => $matches,
        ]]);
    }
}
