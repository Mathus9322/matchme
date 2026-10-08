<?php

namespace App\Models;

use App\Models\Concerns\HasImage;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Team extends Model
{
    use HasImage;

    protected $fillable = ['owner_id', 'coach_id', 'name', 'city'];

    protected static function booted(): void
    {
        // Les joueurs sont supprimés en cascade par la base : on retire leurs photos avant.
        static::deleting(fn (Team $team) => $team->players->each(fn (Player $player) => $player->removeImage()));
    }

    protected function imageColumn(): string
    {
        return 'logo_path';
    }

    protected function imageFolder(): string
    {
        return 'logos';
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    /** Coach : désigné par le manager, il gère l'effectif et propose des matchs amicaux. */
    public function coach(): BelongsTo
    {
        return $this->belongsTo(User::class, 'coach_id');
    }

    /** Le manager qui a créé l'équipe, son coach ou un administrateur. */
    public function isManagedBy(?User $user): bool
    {
        return $user !== null && ($user->isAdmin() || $user->id === $this->owner_id || $user->id === $this->coach_id);
    }

    /** Équipes que l'utilisateur gère comme manager ou comme coach. */
    public function scopeManagedBy(Builder $query, User $user): void
    {
        $query->where(fn ($q) => $q->where('owner_id', $user->id)->orWhere('coach_id', $user->id));
    }

    /** Le capitaine de l'équipe (toujours titulaire, en première position sur le terrain). */
    public function captainId(): ?int
    {
        return $this->players->firstWhere('is_captain', true)?->id;
    }

    /**
     * Ordonne une liste d'identifiants de titulaires : le capitaine en tête, les autres dans l'ordre reçu.
     *
     * @param  list<int>  $starters
     * @return list<int>
     */
    public function captainFirst(array $starters): array
    {
        $captain = $this->captainId();
        if ($captain === null || ! in_array($captain, $starters, true)) {
            return array_values($starters);
        }

        return [$captain, ...array_values(array_filter($starters, fn ($id) => $id !== $captain))];
    }

    /**
     * Équipes sous l'autorité d'un manager : celles qu'il a créées et celles inscrites à ses compétitions.
     * Il en désigne (ou change) le coach et gère les comptes de ces coachs.
     */
    public function scopeControlledBy(Builder $query, User $user): void
    {
        if ($user->isAdmin()) {
            return;
        }
        $query->where(fn ($q) => $q
            ->where('owner_id', $user->id)
            ->orWhereHas('competitions', fn ($c) => $c->where('competitions.owner_id', $user->id)));
    }

    public function isControlledBy(?User $user): bool
    {
        return $user !== null && ($user->isAdmin() || $user->id === $this->owner_id
            || $this->competitions()->where('competitions.owner_id', $user->id)->exists());
    }

    public function players(): HasMany
    {
        return $this->hasMany(Player::class)->orderBy('position');
    }

    public function competitions(): BelongsToMany
    {
        return $this->belongsToMany(Competition::class)->withTimestamps();
    }
}
