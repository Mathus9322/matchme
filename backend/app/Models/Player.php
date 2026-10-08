<?php

namespace App\Models;

use App\Models\Concerns\HasImage;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Player extends Model
{
    use HasImage;

    protected $fillable = ['team_id', 'name', 'position'];

    protected function imageColumn(): string
    {
        return 'photo_path';
    }

    protected function imageFolder(): string
    {
        return 'players';
    }

    public function team(): BelongsTo
    {
        return $this->belongsTo(Team::class);
    }
}
