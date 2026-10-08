<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CompetitionGroup extends Model
{
    protected $fillable = ['competition_id', 'name', 'position'];

    /** Nom de la n-ième poule : A, B, … Z, puis AA, AB, … */
    public static function letter(int $index): string
    {
        $name = '';
        for ($i = $index; $i >= 0; $i = intdiv($i, 26) - 1) {
            $name = chr(65 + $i % 26).$name;
        }

        return $name;
    }

    public function competition(): BelongsTo
    {
        return $this->belongsTo(Competition::class);
    }

    public function teams(): BelongsToMany
    {
        return $this->belongsToMany(Team::class, 'competition_team', 'group_id', 'team_id')->orderBy('name');
    }

    public function games(): HasMany
    {
        return $this->hasMany(Game::class, 'group_id');
    }
}
