<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class GameQuestion extends Model
{
    public const STATUS_PENDING = 'pending';

    public const STATUS_SHOWN = 'shown';

    public const STATUS_REVEALED = 'revealed';

    protected $attributes = ['status' => self::STATUS_PENDING];

    protected $fillable = ['game_id', 'position', 'rubric', 'question', 'answer', 'points', 'status', 'shown_at', 'revealed_at'];

    protected function casts(): array
    {
        return ['shown_at' => 'datetime', 'revealed_at' => 'datetime'];
    }

    public function game(): BelongsTo
    {
        return $this->belongsTo(Game::class);
    }

    public function events(): HasMany
    {
        return $this->hasMany(ScoreEvent::class, 'question_id');
    }

    public function isVisible(): bool
    {
        return $this->status !== self::STATUS_PENDING;
    }
}
