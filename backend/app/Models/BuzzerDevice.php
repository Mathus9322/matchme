<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Téléphone d'un joueur relié au buzzer d'un match (jeton secret, un appareil par joueur). */
class BuzzerDevice extends Model
{
    protected $fillable = ['game_id', 'player_id', 'token_hash', 'last_seen_at'];

    protected $casts = ['last_seen_at' => 'datetime'];

    public function game(): BelongsTo
    {
        return $this->belongsTo(Game::class);
    }

    public function player(): BelongsTo
    {
        return $this->belongsTo(Player::class);
    }

    public static function findByToken(?string $token): ?self
    {
        return $token ? self::with(['game', 'player.team'])->where('token_hash', hash('sha256', $token))->first() : null;
    }
}
