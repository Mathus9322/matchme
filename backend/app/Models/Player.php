<?php

namespace App\Models;

use App\Models\Concerns\HasImage;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Player extends Model
{
    use HasImage;

    protected $fillable = ['team_id', 'name', 'position', 'is_captain'];

    protected $casts = ['is_captain' => 'boolean'];

    protected function imageColumn(): string
    {
        return 'photo_path';
    }

    protected function imageFolder(): string
    {
        return 'players';
    }

    public function events(): HasMany
    {
        return $this->hasMany(ScoreEvent::class);
    }

    public function team(): BelongsTo
    {
        return $this->belongsTo(Team::class);
    }
}
