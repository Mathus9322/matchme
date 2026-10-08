<?php

namespace App\Models;

use App\Models\Concerns\HasImage;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Team extends Model
{
    use HasImage;

    protected $fillable = ['owner_id', 'name', 'city'];

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

    public function players(): HasMany
    {
        return $this->hasMany(Player::class)->orderBy('position');
    }

    public function competitions(): BelongsToMany
    {
        return $this->belongsToMany(Competition::class)->withTimestamps();
    }
}
