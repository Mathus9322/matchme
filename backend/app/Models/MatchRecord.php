<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MatchRecord extends Model
{
    protected $table = 'matches';

    protected $fillable = [
        'team_a_name',
        'team_a_players',
        'team_b_name',
        'team_b_players',
    ];

    protected function casts(): array
    {
        return [
            'team_a_players' => 'array',
            'team_b_players' => 'array',
        ];
    }
}