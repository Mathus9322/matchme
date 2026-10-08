<?php

namespace App\Support;

use App\Models\Game;
use App\Models\GamePlayer;
use App\Models\Player;
use App\Models\Team;
use Illuminate\Support\Collection;

/**
 * Calcul des statistiques d'équipe et de joueur sur les matchs terminés
 * (matchs de compétition et matchs amicaux).
 */
class TeamStatistics
{
    /** @return Collection<int, Game> du plus ancien au plus récent */
    public function finishedGames(Team $team): Collection
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
     * Bilan et forme (5 derniers résultats, du plus récent au plus ancien).
     *
     * @param  Collection<int, Game>  $games
     * @return array{record: array<string, int|float>, form: list<string>}
     */
    public function record(Team $team, Collection $games): array
    {
        $record = ['played' => 0, 'won' => 0, 'drawn' => 0, 'lost' => 0, 'points_for' => 0, 'points_against' => 0, 'friendlies' => 0];
        $form = [];
        foreach ($games as $game) {
            [$for, $against] = $this->scoresFor($team, $game);
            $record['played']++;
            $record['friendlies'] += $game->isFriendly() ? 1 : 0;
            $record['points_for'] += $for;
            $record['points_against'] += $against;
            $result = $for <=> $against;
            $record[[-1 => 'lost', 0 => 'drawn', 1 => 'won'][$result]]++;
            $form[] = [-1 => 'D', 0 => 'N', 1 => 'V'][$result];
        }
        $record['win_rate'] = $record['played'] ? round($record['won'] / $record['played'] * 100) : 0;
        $record['average_for'] = $record['played'] ? round($record['points_for'] / $record['played'], 1) : 0;
        $record['average_against'] = $record['played'] ? round($record['points_against'] / $record['played'], 1) : 0;

        return ['record' => $record, 'form' => array_slice(array_reverse($form), 0, 5)];
    }

    /**
     * Statistiques de chaque joueur de l'équipe, du meilleur marqueur au moins prolifique.
     *
     * @param  Collection<int, Game>  $games
     */
    public function players(Team $team, Collection $games): Collection
    {
        return $team->players
            ->map(fn (Player $player) => ['id' => $player->id, 'name' => $player->name, 'photo_url' => $player->imageUrl(), 'is_captain' => $player->is_captain, ...$this->playerTotals($player, $team, $games)])
            ->sortByDesc('points')
            ->values();
    }

    /**
     * Totaux d'un joueur. Un match est joué s'il était titulaire, s'il est entré en jeu
     * ou s'il a marqué (un remplaçant resté sur le banc n'a pas joué).
     *
     * @param  Collection<int, Game>  $games
     */
    public function playerTotals(Player $player, Team $team, Collection $games): array
    {
        $events = $player->events()->whereIn('game_id', $games->pluck('id'))->get(['game_id', 'points']);
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

    /** Titulaire, ou remplaçant entré en jeu. */
    public function played(Game $game, Team $team, Player $player): bool
    {
        $row = $game->lineupFor($game->team_a_id === $team->id ? $game->teamA : $game->teamB)->first(fn ($r) => $r['player']->id === $player->id);

        return $row !== null && ($row['role'] === GamePlayer::ROLE_STARTER || $row['on_field'] || $game->substitutions->contains('player_in_id', $player->id));
    }

    /** @return array{0: int, 1: int} points marqués et encaissés par l'équipe dans ce match */
    public function scoresFor(Team $team, Game $game): array
    {
        return $game->team_a_id === $team->id ? [$game->score_a, $game->score_b] : [$game->score_b, $game->score_a];
    }
}
