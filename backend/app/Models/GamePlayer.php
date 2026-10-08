<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Ligne de la feuille de match : un joueur, son rôle et sa présence sur le terrain. */
class GamePlayer extends Model
{
    public const ROLE_STARTER = 'starter';

    public const ROLE_SUBSTITUTE = 'substitute';

    protected $fillable = ['game_id', 'team_id', 'player_id', 'role', 'on_field', 'position'];

    protected function casts(): array
    {
        return ['on_field' => 'boolean'];
    }

    public function player(): BelongsTo
    {
        return $this->belongsTo(Player::class);
    }
}
