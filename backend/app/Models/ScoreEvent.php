<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ScoreEvent extends Model
{
    protected $fillable = ['game_id', 'team_id', 'player_id', 'rubric_id', 'user_id', 'points'];

    public function game(): BelongsTo
    {
        return $this->belongsTo(Game::class);
    }

    public function rubric(): BelongsTo
    {
        return $this->belongsTo(CompetitionRubric::class, 'rubric_id');
    }

    public function player(): BelongsTo
    {
        return $this->belongsTo(Player::class);
    }
}
