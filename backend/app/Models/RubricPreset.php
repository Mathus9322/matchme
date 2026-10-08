<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RubricPreset extends Model
{
    protected $fillable = ['name', 'description', 'points', 'penalties', 'position'];

    protected function casts(): array
    {
        return ['points' => 'array', 'penalties' => 'boolean'];
    }
}
