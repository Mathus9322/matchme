<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CompetitionRubric extends Model
{
    protected $fillable = ['competition_id', 'name', 'description', 'points', 'penalties', 'position'];

    protected function casts(): array
    {
        return ['points' => 'array', 'penalties' => 'boolean'];
    }

    public function competition(): BelongsTo
    {
        return $this->belongsTo(Competition::class);
    }

    public function toData(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'description' => $this->description,
            'points' => $this->points,
            'penalties' => $this->penalties,
        ];
    }
}
