<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ResultSheet extends Model
{
    protected $fillable = ['competition_id', 'game_id', 'title', 'data'];

    protected function casts(): array
    {
        return ['data' => 'array'];
    }

    public function competition(): BelongsTo
    {
        return $this->belongsTo(Competition::class);
    }

    public function game(): BelongsTo
    {
        return $this->belongsTo(Game::class);
    }

    /**
     * Fige la feuille de score d'un match terminé (créée ou remplacée).
     * Les matchs amicaux, sans compétition, n'ont pas de dossier : aucune feuille.
     */
    public static function capture(Game $game): ?self
    {
        if ($game->competition_id === null) {
            return null;
        }

        $game->load(['competition.rubrics', 'competition.owner', 'group', 'teamA.players', 'teamB.players', 'events.player', 'events.rubric', 'sheet', 'substitutions.playerIn', 'substitutions.playerOut', 'questions']);
        $rubrics = $game->competition->rubrics;
        $title = "{$game->teamA->name} – {$game->teamB->name}";

        $team = function (Team $team, int $score) use ($game, $rubrics) {
            $events = $game->events->where('team_id', $team->id);

            return [
                'name' => $team->name,
                'city' => $team->city,
                'logo_url' => $team->imageUrl(),
                'score' => $score,
                'bonus' => (int) $events->whereNull('player_id')->sum('points'),
                'players' => $game->lineupFor($team)->map(fn ($row) => [
                    'name' => $row['player']->name,
                    'photo_url' => $row['player']->imageUrl(),
                    'role' => $row['role'],
                    'on_field' => $row['on_field'],
                    'score' => (int) $events->where('player_id', $row['player']->id)->sum('points'),
                ])->values()->all(),
                'rubrics' => $rubrics->map(fn ($r) => (int) $events->where('rubric_id', $r->id)->sum('points'))->values()->all(),
                'substitutions' => $game->substitutions->where('team_id', $team->id)->sortBy('id')->map(fn ($s) => [
                    'out' => $s->playerOut?->name,
                    'in' => $s->playerIn?->name,
                ])->values()->all(),
            ];
        };

        [$scoreA, $scoreB] = [$game->score_a, $game->score_b];

        $data = [
            'competition' => $game->competition->name,
            'format' => $game->competition->format,
            'group' => $game->group?->name,
            'round' => $game->round,
            'scheduled_at' => $game->scheduled_at?->toIso8601String(),
            'started_at' => $game->started_at?->toIso8601String(),
            'finished_at' => $game->finished_at?->toIso8601String(),
            'manager' => $game->competition->owner?->name,
            'rubrics' => $rubrics->pluck('name')->all(),
            'team_a' => $team($game->teamA, $scoreA),
            'team_b' => $team($game->teamB, $scoreB),
            'winner' => $scoreA === $scoreB ? null : ($scoreA > $scoreB ? 'a' : 'b'),
            'events' => $game->events->sortBy('id')->map(fn ($e) => [
                'time' => $e->created_at?->toIso8601String(),
                'team' => $e->team_id === $game->team_a_id ? 'a' : 'b',
                'player' => $e->player?->name,
                'rubric' => $e->rubric?->name,
                'points' => $e->points,
            ])->values()->all(),
            // Questions effectivement posées, avec leur réponse et les joueurs qui ont répondu.
            'questions' => $game->questions->filter->isVisible()->values()->map(fn ($q) => [
                'position' => $q->position,
                'rubric' => $q->rubric,
                'question' => $q->question,
                'answer' => $q->answer,
                'answered' => $game->events->where('question_id', $q->id)->sortBy('id')->values()->map(fn ($e) => [
                    'player' => $e->player?->name,
                    'team' => $e->team_id === $game->team_a_id ? 'a' : 'b',
                    'points' => $e->points,
                ])->all(),
            ])->all(),
            'generated_at' => now()->toIso8601String(),
        ];

        return self::updateOrCreate(
            ['game_id' => $game->id],
            ['competition_id' => $game->competition_id, 'title' => $title, 'data' => $data],
        );
    }
}
