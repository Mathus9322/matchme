<?php

namespace App\Models;

use App\Models\Concerns\HasImage;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Storage;

class Competition extends Model
{
    use HasImage;

    public const STATUS_DRAFT = 'draft';

    public const STATUS_OPEN = 'open';

    public const STATUS_ONGOING = 'ongoing';

    public const STATUS_FINISHED = 'finished';

    public const STATUSES = [self::STATUS_DRAFT, self::STATUS_OPEN, self::STATUS_ONGOING, self::STATUS_FINISHED];

    public const FORMAT_GROUPS = 'groups';

    public const FORMAT_LEAGUE = 'league';

    /** Barème utilisé quand l'organisateur n'en a pas défini. */
    public const DEFAULT_SCORING = ['points' => [10, 20, 30, 40], 'penalties' => true];

    protected $attributes = ['status' => 'draft', 'format' => self::FORMAT_GROUPS];

    protected $fillable = ['owner_id', 'name', 'description', 'starts_on', 'ends_on', 'status', 'format', 'scoring'];

    protected function casts(): array
    {
        return [
            'starts_on' => 'date:Y-m-d',
            'ends_on' => 'date:Y-m-d',
            'scoring' => 'array',
        ];
    }

    protected static function booted(): void
    {
        // Les lignes sont supprimées en cascade par la base ; on retire aussi les fichiers.
        static::deleted(fn (Competition $competition) => Storage::disk('local')->deleteDirectory("competitions/{$competition->id}"));
    }

    protected function imageColumn(): string
    {
        return 'cover_path';
    }

    protected function imageFolder(): string
    {
        return 'covers';
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    public function teams(): BelongsToMany
    {
        return $this->belongsToMany(Team::class)->withPivot('group_id')->withTimestamps()->orderBy('name');
    }

    public function groups(): HasMany
    {
        return $this->hasMany(CompetitionGroup::class)->orderBy('position')->orderBy('id');
    }

    public function games(): HasMany
    {
        return $this->hasMany(Game::class);
    }

    public function rubrics(): HasMany
    {
        return $this->hasMany(CompetitionRubric::class)->orderBy('position')->orderBy('id');
    }

    /** @return array{points: list<int>, penalties: bool} */
    public function scale(): array
    {
        return $this->scoring ?? self::DEFAULT_SCORING;
    }

    public function resultSheets(): HasMany
    {
        return $this->hasMany(ResultSheet::class);
    }

    public function documents(): HasMany
    {
        return $this->hasMany(CompetitionDocument::class);
    }

    public function isFinished(): bool
    {
        return $this->status === self::STATUS_FINISHED;
    }

    public function isManagedBy(?User $user): bool
    {
        return $user !== null && ($user->isAdmin() || $user->id === $this->owner_id);
    }

    /**
     * Classement général de toutes les équipes inscrites.
     *
     * @return list<array<string, mixed>>
     */
    public function standings(): array
    {
        $games = $this->games()->where('status', Game::STATUS_FINISHED)->withScores()->get();

        return self::computeStandings($this->teams, $games);
    }

    /**
     * Classement de chaque poule, à partir des seuls matchs de la poule.
     *
     * @return list<array<string, mixed>>
     */
    public function groupStandings(): array
    {
        $games = $this->games()->whereNotNull('group_id')->where('status', Game::STATUS_FINISHED)->withScores()->get()->groupBy('group_id');

        return $this->groups->map(fn (CompetitionGroup $group) => [
            'id' => $group->id,
            'name' => $group->name,
            'standings' => self::computeStandings(
                $this->teams->where('pivot.group_id', $group->id),
                $games->get($group->id, collect()),
            ),
        ])->all();
    }

    /**
     * 3 points pour une victoire, 1 pour un nul ; départage à la différence puis aux points marqués.
     *
     * @param  Collection<int, Team>  $teams
     * @param  Collection<int, Game>  $finishedGames
     * @return list<array<string, mixed>>
     */
    public static function computeStandings(Collection $teams, Collection $finishedGames): array
    {
        $rows = $teams->mapWithKeys(fn (Team $team) => [$team->id => [
            'team' => ['id' => $team->id, 'name' => $team->name, 'logo_url' => $team->imageUrl()],
            'played' => 0, 'won' => 0, 'drawn' => 0, 'lost' => 0,
            'points_for' => 0, 'points_against' => 0, 'points' => 0,
        ]])->all();

        foreach ($finishedGames as $game) {
            foreach ([[$game->team_a_id, $game->score_a, $game->score_b], [$game->team_b_id, $game->score_b, $game->score_a]] as [$teamId, $for, $against]) {
                if (! isset($rows[$teamId])) {
                    continue;
                }
                $row = &$rows[$teamId];
                $row['played']++;
                $row['points_for'] += $for;
                $row['points_against'] += $against;
                if ($for > $against) {
                    $row['won']++;
                    $row['points'] += 3;
                } elseif ($for === $against) {
                    $row['drawn']++;
                    $row['points'] += 1;
                } else {
                    $row['lost']++;
                }
                unset($row);
            }
        }

        $rows = array_values($rows);
        usort($rows, fn ($a, $b) => [$b['points'], $b['points_for'] - $b['points_against'], $b['points_for']]
            <=> [$a['points'], $a['points_for'] - $a['points_against'], $a['points_for']]);

        return $rows;
    }
}
