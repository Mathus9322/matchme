<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Substitution extends Model
{
    protected $fillable = ['game_id', 'team_id', 'player_out_id', 'player_in_id', 'user_id'];

    public function playerOut(): BelongsTo
    {
        return $this->belongsTo(Player::class, 'player_out_id');
    }

    public function playerIn(): BelongsTo
    {
        return $this->belongsTo(Player::class, 'player_in_id');
    }
}
