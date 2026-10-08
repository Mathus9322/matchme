<?php

namespace App\Http\Controllers;

use App\Http\Resources\GameResource;
use App\Models\Game;
use App\Models\GamePlayer;
use App\Models\Player;
use App\Models\Team;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Collection;

/** Fiches publiques : statistiques d'une équipe et de ses joueurs. */
class TeamStatsController extends Controller
{
    public function team(Team $team): JsonResponse
    {
        $team->load(['owner', 'players', 'competitions']);
        $finished = $this->finishedGames($team);

        $record = ['played' => 0, 'won' => 0, 'drawn' => 0, 'lost' => 0, 'points_for' => 0, 'points_against' => 0];
        $form = [];
        foreach ($finished as $game) {
            [$for, $against] = $game->team_a_id === $team->id ? [$game->score_a, $game->score_b] : [$game->score_b, $game->score_a];
            $record['played']++;
            $record['points_for'] += $for;
            $record['points_against'] += $against;
            $result = $for <=> $against;
            $record[[-1 => 'lost', 0 => 'drawn', 1 => 'won'][$result]]++;
            $form[] = [-1 => 'D', 0 => 'N', 1 => 'V'][$result];
        }
        $record['win_rate'] = $record['played'] ? round($record['won'] / $record['played'] * 100) : 0;
        $record['average_for'] = $record['played'] ? round($record['points_for'] / $record['played'], 1) : 0;
        $record['average_against'] = $record['played'] ? round($record['points_against'] / $record['played'], 1) : 0;

        $players = $team->players->map(fn (Player $player) => ['id' => $player->id, 'name' => $player->name, 'photo_url' => $player->imageUrl(), ...$this->playerTotals($player, $finished)])
            ->sortByDesc('points')->values();

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
                'competitions' => $team->competitions->map(fn ($c) => ['id' => $c->id, 'name' => $c->name, 'status' => $c->status])->values(),
            ],
            'record' => $record,
            // Forme : du plus récent au plus ancien.
            'form' => array_slice(array_reverse($form), 0, 5),
            'players' => $players,
            'top_scorer' => $players->first(fn ($p) => $p['points'] > 0),
            'recent' => GameResource::collection($finished->reverse()->take(8)->values()),
            'upcoming' => GameResource::collection($upcoming),
        ]]);
    }

    public function player(Player $player): JsonResponse
    {
        $team = $player->team()->with('players')->firstOrFail();
        $finished = $this->finishedGames($team);
        $events = $player->events()->with('rubric')->whereIn('game_id', $finished->pluck('id'))->get();

        $matches = $finished->reverse()->map(function (Game $game) use ($player, $team, $events) {
            $row = $game->lineupFor($team)->first(fn ($r) => $r['player']->id === $player->id);
            $mine = $events->where('game_id', $game->id);
            if (! $this->played($game, $team, $player) && $mine->isEmpty()) {
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
            ...$this->playerTotals($player, $finished),
            'best' => $matches->sortByDesc('points')->first(fn ($m) => $m['points'] > 0),
            'rubrics' => $rubrics,
            'matches' => $matches,
        ]]);
    }

    /** Titulaire, ou remplaçant entré en jeu. */
    private function played(Game $game, Team $team, Player $player): bool
    {
        $row = $game->lineupFor($game->team_a_id === $team->id ? $game->teamA : $game->teamB)->first(fn ($r) => $r['player']->id === $player->id);

        return $row !== null && ($row['role'] === GamePlayer::ROLE_STARTER || $row['on_field'] || $game->substitutions->contains('player_in_id', $player->id));
    }

    /** @return Collection<int, Game> */
    private function finishedGames(Team $team): Collection
    {
        return Game::query()
            ->with(['competition', 'group', 'teamA.players', 'teamB.players', 'sheet', 'substitutions'])
            ->withScores()
            ->where(fn ($q) => $q->where('team_a_id', $team->id)->orWhere('team_b_id', $team->id))
            ->where('status', Game::STATUS_FINISHED)
            ->orderBy('finished_at')
            ->orderBy('id')
            ->get();
    }

    /**
     * Totaux d'un joueur sur les matchs terminés de son équipe.
     * Un match est joué s'il était titulaire, s'il est entré en jeu ou s'il a marqué
     * (un remplaçant resté sur le banc n'a pas joué).
     *
     * @param  Collection<int, Game>  $games
     */
    private function playerTotals(Player $player, Collection $games): array
    {
        $events = $player->events()->whereIn('game_id', $games->pluck('id'))->get(['game_id', 'points']);
        $team = $player->team;

        $appearances = $games->filter(fn (Game $game) => $this->played($game, $team, $player) || $events->contains('game_id', $game->id))->count();
        $points = (int) $events->sum('points');

        return [
            'appearances' => $appearances,
            'points' => $points,
            'average' => $appearances ? round($points / $appearances, 1) : 0,
            'answers' => $events->where('points', '>', 0)->count(),
            'penalties' => $events->where('points', '<', 0)->count(),
        ];
    }
}
