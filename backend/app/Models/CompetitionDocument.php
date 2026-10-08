<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

class CompetitionDocument extends Model
{
    protected $fillable = ['competition_id', 'user_id', 'name', 'path', 'mime_type', 'size'];

    protected static function booted(): void
    {
        static::deleted(fn (CompetitionDocument $document) => Storage::disk('local')->delete($document->path));
    }

    /** Dossier privé d'un utilisateur dans une compétition. */
    public static function folder(int $competitionId, int $userId): string
    {
        return "competitions/{$competitionId}/users/{$userId}";
    }

    public function competition(): BelongsTo
    {
        return $this->belongsTo(Competition::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function isVisibleTo(User $user): bool
    {
        return $user->id === $this->user_id || $this->competition->isManagedBy($user);
    }
}
