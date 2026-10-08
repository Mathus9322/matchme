<?php

namespace App\Http\Resources;

use App\Models\Competition;
use App\Models\Game;
use App\Models\GameQuestion;
use App\Models\Team;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Game */
class GameResource extends JsonResource
{
    /** Relations nécessaires à la vue détaillée d'un match. */
    public const DETAIL_RELATIONS = ['competition.rubrics', 'competition.owner', 'group', 'owner', 'teamA.players', 'teamB.players', 'events.player', 'events.rubric', 'sheet', 'resultSheet', 'substitutions.playerIn', 'substitutions.playerOut', 'questions'];

    /** Ajoute le détail des joueurs et le fil des événements (vue match en direct). */
    public bool $detailed = false;

    public function detailed(): static
    {
        $this->detailed = true;

        return $this;
    }

    public function toArray(Request $request): array
    {
        $user = $request->user('sanctum');

        return [
            'id' => $this->id,
            'round' => $this->round,
            'status' => $this->status,
            'phase' => $this->phase,
            'scheduled_at' => $this->scheduled_at,
            'started_at' => $this->started_at,
            'finished_at' => $this->finished_at,
            'friendly' => $this->isFriendly(),
            'competition' => $this->whenLoaded('competition', fn () => $this->competition ? [
                'id' => $this->competition->id,
                'name' => $this->competition->name,
            ] : null),
            'group' => $this->whenLoaded('group', fn () => $this->group ? ['id' => $this->group->id, 'name' => $this->group->name] : null),
            'owner' => $this->whenLoaded('owner', fn () => $this->owner?->summary()),
            // Responsable du match : l'organisateur de la compétition, ou le créateur d'un amical.
            'manager' => $this->when($this->detailed, fn () => ($this->isFriendly() ? $this->owner : $this->competition->owner)?->summary()),
            'team_a' => $this->team($this->teamA, $this->score_a),
            'team_b' => $this->team($this->teamB, $this->score_b),
            'events' => $this->when($this->detailed, fn () => $this->events->sortByDesc('id')->take(20)->values()->map(fn ($event) => [
                'id' => $event->id,
                'team_id' => $event->team_id,
                'player' => $event->player?->name,
                'rubric' => $event->rubric?->name,
                'question_id' => $event->question_id,
                'points' => $event->points,
                'created_at' => $event->created_at,
            ])),
            'questions' => $this->when($this->detailed, fn () => $this->questionsFor($user)),
            'current_question_id' => $this->when($this->detailed, fn () => $this->current_question_id),
            'uses_buzzer' => (bool) $this->uses_buzzer,
            'watch_code' => $this->watch_code,
            // Rubrique en cours : celle choisie par le manager, sinon la première du programme.
            'current_rubric_id' => $this->when($this->detailed, fn () => $this->current_rubric_id ?? $this->competition?->rubrics->first()?->id),
            'questions_source' => $this->when($this->detailed && $this->isManagedBy($user), fn () => $this->questions_source),
            'result_sheet_id' => $this->when($this->detailed, fn () => $this->resultSheet?->id),
            'substitutions' => $this->when($this->detailed, fn () => $this->substitutions->sortByDesc('id')->values()->map(fn ($sub) => [
                'id' => $sub->id,
                'team_id' => $sub->team_id,
                'player_out' => $sub->playerOut?->name,
                'player_in' => $sub->playerIn?->name,
                'created_at' => $sub->created_at,
            ])),
            'scoring' => $this->when($this->detailed, fn () => $this->competition?->scale() ?? Competition::DEFAULT_SCORING),
            'rubrics' => $this->when($this->detailed, fn () => $this->competition?->rubrics->map->toData() ?? []),
            'can_manage' => $this->when($this->relationLoaded('competition'), fn () => $this->isManagedBy($user)),
            'updated_at' => $this->updated_at,
        ];
    }

    /**
     * Questions du match : toutes pour le manager ; pour le public, seulement celles affichées,
     * et la réponse seulement une fois révélée. Chaque question liste les joueurs qui ont répondu.
     */
    private function questionsFor(?User $user): array
    {
        $manager = $this->isManagedBy($user);

        return $this->questions
            ->filter(fn ($q) => $manager || $q->isVisible())
            ->map(fn ($q) => [
                'id' => $q->id,
                'position' => $q->position,
                'rubric' => $q->rubric,
                'question' => $q->question,
                'answer' => $manager || $q->status === GameQuestion::STATUS_REVEALED ? $q->answer : null,
                'points' => $q->points,
                'status' => $q->status,
                'answered' => $this->events->where('question_id', $q->id)->sortBy('id')->values()->map(fn ($e) => [
                    'player' => $e->player?->name,
                    'photo_url' => $e->player?->imageUrl(),
                    'team_id' => $e->team_id,
                    'points' => $e->points,
                ]),
            ])->values()->all();
    }

    private function team(?Team $team, int $score): ?array
    {
        if ($team === null) {
            return null;
        }

        $data = ['id' => $team->id, 'name' => $team->name, 'logo_url' => $team->imageUrl(), 'score' => $score];

        if ($this->detailed) {
            $events = $this->events->where('team_id', $team->id);
            $data['bonus'] = (int) $events->whereNull('player_id')->sum('points');
            $data['rubric_scores'] = $events->whereNotNull('rubric_id')->groupBy('rubric_id')->map(fn ($e) => (int) $e->sum('points'));
            // Feuille de match : titulaires puis remplaçants, avec leur présence sur le terrain.
            $data['players'] = $this->lineupFor($team)->map(fn ($row) => [
                'id' => $row['player']->id,
                'name' => $row['player']->name,
                'photo_url' => $row['player']->imageUrl(),
                'is_captain' => $row['player']->is_captain,
                'role' => $row['role'],
                'on_field' => $row['on_field'],
                'score' => (int) $events->where('player_id', $row['player']->id)->sum('points'),
            ])->values();
            // Effectif complet, pour composer la feuille avant le coup d'envoi.
            $data['roster'] = $team->players->map(fn ($player) => [
                'id' => $player->id,
                'name' => $player->name,
                'photo_url' => $player->imageUrl(),
                'is_captain' => $player->is_captain,
            ])->values();
            $data['can_manage_team'] = $this->canManageTeam(request()->user('sanctum'), $team->id);
        }

        return $data;
    }
}
