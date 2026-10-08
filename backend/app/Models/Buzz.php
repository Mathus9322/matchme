<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Un buzz enregistré : le premier de la manche donne la main au joueur, l'arbitre le juge. */
class Buzz extends Model
{
    public const CORRECT = 'correct';

    public const WRONG = 'wrong';

    /** Le joueur a passé : pas de points, la main passe à l'équipe adverse. */
    public const PASSED = 'passed';

    protected $table = 'buzzes';

    protected $fillable = ['game_id', 'player_id', 'team_id', 'round', 'result'];

    public function player(): BelongsTo
    {
        return $this->belongsTo(Player::class);
    }

    public function team(): BelongsTo
    {
        return $this->belongsTo(Team::class);
    }
}
