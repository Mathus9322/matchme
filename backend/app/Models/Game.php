<?php

namespace App\Models;

use App\Support\Buzzer;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Support\Collection;

class Game extends Model
{
    public const STATUS_SCHEDULED = 'scheduled';

    public const STATUS_LIVE = 'live';

    public const STATUS_FINISHED = 'finished';

    public const PHASE_FIRST_HALF = 'first_half';

    public const PHASE_HALFTIME = 'halftime';

    public const PHASE_SECOND_HALF = 'second_half';

    /** Joueurs alignés par équipe : 4 titulaires sur le terrain, jusqu'à 2 remplaçants. */
    public const STARTERS = 4;

    public const MAX_SUBSTITUTES = 2;

    protected $attributes = ['status' => self::STATUS_SCHEDULED];

    protected $fillable = ['competition_id', 'group_id', 'owner_id', 'team_a_id', 'team_b_id', 'round', 'scheduled_at', 'status', 'phase', 'current_question_id', 'current_rubric_id', 'uses_buzzer', 'questions_source', 'started_at', 'finished_at', 'reminder_sent_at'];

    protected function casts(): array
    {
        return [
            'scheduled_at' => 'datetime',
            'uses_buzzer' => 'boolean',
            'started_at' => 'datetime',
            'finished_at' => 'datetime',
            'reminder_sent_at' => 'datetime',
        ];
    }

    /** Minutes avant le coup d'envoi auxquelles les managers d'équipe sont prévenus. */
    public const REMINDER_MINUTES = 10;

    /** Caractères du code spectateur : sans 0/O, 1/I/L, faciles à lire et à dicter. */
    private const WATCH_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

    public static function newWatchCode(): string
    {
        do {
            $code = '';
            for ($i = 0; $i < 5; $i++) {
                $code .= self::WATCH_ALPHABET[random_int(0, strlen(self::WATCH_ALPHABET) - 1)];
            }
        } while (self::where('watch_code', $code)->exists());

        return $code;
    }

    protected static function booted(): void
    {
        // Chaque match reçoit un code pour que les spectateurs le retrouvent directement.
        static::creating(function (Game $game) {
            $game->watch_code ??= self::newWatchCode();
        });

        // Hors du jeu (mi-temps, fin, match rouvert…), le buzzer se ferme ; les téléphones sont prévenus.
        static::updated(function (Game $game) {
            if (! $game->wasChanged(['status', 'phase']) || ! $game->buzzer_channel) {
                return;
            }
            if (! $game->isInPlay() && $game->buzzer_status !== Buzzer::CLOSED) {
                $game->forceFill(['buzzer_status' => Buzzer::CLOSED, 'buzzer_excluded_team_id' => null])->saveQuietly();
            }
            app(Buzzer::class)->announce($game);
        });

        // Un match reprogrammé déclenchera un nouveau rappel.
        static::saving(function (Game $game) {
            if ($game->exists && $game->isDirty('scheduled_at')) {
                $game->reminder_sent_at = null;
            }
        });
    }

    public function competition(): BelongsTo
    {
        return $this->belongsTo(Competition::class);
    }

    public function group(): BelongsTo
    {
        return $this->belongsTo(CompetitionGroup::class, 'group_id');
    }

    public function sheet(): HasMany
    {
        return $this->hasMany(GamePlayer::class);
    }

    public function substitutions(): HasMany
    {
        return $this->hasMany(Substitution::class);
    }

    /** Une équipe peut-elle être gérée par cet utilisateur pour ce match (feuille, remplacements) ? */
    public function canManageTeam(?User $user, int $teamId): bool
    {
        if ($user === null) {
            return false;
        }
        $team = $teamId === $this->team_a_id ? $this->teamA : $this->teamB;

        return $this->isManagedBy($user) || ($team?->isManagedBy($user) ?? false);
    }

    /**
     * Feuille de match d'une équipe : celle enregistrée, sinon la composition par défaut
     * (les 4 premiers joueurs titulaires, les 2 suivants remplaçants).
     *
     * @return Collection<int, array{player: Player, role: string, on_field: bool}>
     */
    public function lineupFor(Team $team): Collection
    {
        $stored = $this->relationLoaded('sheet') ? $this->sheet->where('team_id', $team->id) : $this->sheet()->where('team_id', $team->id)->get();

        if ($stored->isNotEmpty()) {
            $players = $team->players->keyBy('id');

            // Le capitaine sur le terrain passe toujours en tête.
            return $stored->filter(fn ($row) => $players->has($row->player_id))
                ->sortBy(fn ($row) => [$row->on_field ? 0 : 1, $row->on_field && $players[$row->player_id]->is_captain ? 0 : 1, $row->position])
                ->map(fn ($row) => ['player' => $players[$row->player_id], 'role' => $row->role, 'on_field' => $row->on_field])
                ->values();
        }

        // Composition par défaut : le capitaine en tête, puis l'ordre de l'effectif.
        return $team->players->sortBy(fn (Player $player) => [$player->is_captain ? 0 : 1, $player->position])
            ->take(self::STARTERS + self::MAX_SUBSTITUTES)->values()->map(fn (Player $player, int $i) => [
                'player' => $player,
                'role' => $i < self::STARTERS ? GamePlayer::ROLE_STARTER : GamePlayer::ROLE_SUBSTITUTE,
                'on_field' => $i < self::STARTERS,
            ]);
    }

    /** Enregistre la composition par défaut d'une équipe si sa feuille n'existe pas encore. */
    public function persistLineup(Team $team): void
    {
        if ($this->sheet()->where('team_id', $team->id)->exists()) {
            return;
        }
        $this->lineupFor($team)->each(fn ($row, $position) => $this->sheet()->create([
            'team_id' => $team->id,
            'player_id' => $row['player']->id,
            'role' => $row['role'],
            'on_field' => $row['on_field'],
            'position' => $position,
        ]));
        $this->unsetRelation('sheet');
    }

    /** Vérifie les effectifs et fige la feuille des deux équipes au coup d'envoi. */
    public function lockLineups(): void
    {
        foreach ([$this->teamA, $this->teamB] as $team) {
            $onField = $this->lineupFor($team)->where('on_field', true);
            if ($onField->count() < self::STARTERS) {
                abort(422, "« {$team->name} » doit aligner ".self::STARTERS.' joueurs titulaires pour commencer le match.');
            }
            $captain = $team->players->firstWhere('is_captain', true);
            if ($captain && ! $onField->contains(fn ($row) => $row['player']->id === $captain->id)) {
                abort(422, "Le capitaine de « {$team->name} » ({$captain->name}) doit être titulaire pour commencer le match.");
            }
            $this->persistLineup($team);
        }
    }

    /** Le jeu est en cours (hors mi-temps) : seul moment où l'on avance rubriques et questions. */
    public function isInPlay(): bool
    {
        return $this->status === self::STATUS_LIVE && $this->phase !== self::PHASE_HALFTIME;
    }

    public function isOnField(int $playerId): bool
    {
        $team = $this->teamA->players->contains('id', $playerId) ? $this->teamA : $this->teamB;

        return $this->lineupFor($team)->contains(fn ($row) => $row['player']->id === $playerId && $row['on_field']);
    }

    public function questions(): HasMany
    {
        return $this->hasMany(GameQuestion::class)->orderBy('position')->orderBy('id');
    }

    public function currentQuestion(): BelongsTo
    {
        return $this->belongsTo(GameQuestion::class, 'current_question_id');
    }

    public function resultSheet(): HasOne
    {
        return $this->hasOne(ResultSheet::class);
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    public function isFriendly(): bool
    {
        return $this->competition_id === null;
    }

    /** Un match de compétition est géré par l'organisateur ; un amical par son créateur. */
    public function isManagedBy(?User $user): bool
    {
        if ($user === null) {
            return false;
        }

        return $this->isFriendly()
            ? $user->isAdmin() || $user->id === $this->owner_id
            : $this->competition->isManagedBy($user);
    }

    /**
     * Valeurs de points autorisées pour une rubrique (ou le barème par défaut), pénalités comprises.
     *
     * @return list<int>
     */
    public function allowedPoints(?CompetitionRubric $rubric): array
    {
        $scale = $rubric
            ? ['points' => $rubric->points, 'penalties' => $rubric->penalties]
            : ($this->competition?->scale() ?? Competition::DEFAULT_SCORING);

        return $scale['penalties']
            ? [...$scale['points'], ...array_map(fn ($p) => -$p, $scale['points'])]
            : $scale['points'];
    }

    public function teamA(): BelongsTo
    {
        return $this->belongsTo(Team::class, 'team_a_id');
    }

    public function teamB(): BelongsTo
    {
        return $this->belongsTo(Team::class, 'team_b_id');
    }

    public function events(): HasMany
    {
        return $this->hasMany(ScoreEvent::class);
    }

    /**
     * Ajoute les colonnes score_a et score_b calculées à partir des événements.
     */
    public function scopeWithScores(Builder $query): Builder
    {
        return $query->withSum(['events as score_a' => fn ($q) => $q->whereColumn('score_events.team_id', 'games.team_a_id')], 'points')
            ->withSum(['events as score_b' => fn ($q) => $q->whereColumn('score_events.team_id', 'games.team_b_id')], 'points');
    }

    protected function getScoreAAttribute($value): int
    {
        return $this->scoreFor('score_a', $value, $this->team_a_id);
    }

    protected function getScoreBAttribute($value): int
    {
        return $this->scoreFor('score_b', $value, $this->team_b_id);
    }

    private function scoreFor(string $key, $value, int $teamId): int
    {
        if (array_key_exists($key, $this->attributes)) {
            return (int) $value;
        }

        return (int) $this->events->where('team_id', $teamId)->sum('points');
    }
}
