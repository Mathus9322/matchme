<?php

namespace App\Models;

use App\Models\Concerns\HasImage;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\HasApiTokens;

#[Fillable(['name', 'email', 'password', 'role'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, HasImage, Notifiable;

    public const ROLE_ADMIN = 'admin';

    public const ROLE_MANAGER = 'manager';

    public const ROLE_USER = 'user';

    public const ROLES = [self::ROLE_USER, self::ROLE_MANAGER, self::ROLE_ADMIN];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    protected static function booted(): void
    {
        // Avant la suppression en cascade : retire les dossiers de l'utilisateur dans chaque compétition.
        static::deleting(function (User $user) {
            $user->documents()->distinct()->pluck('competition_id')->each(
                fn ($competitionId) => Storage::disk('local')->deleteDirectory(CompetitionDocument::folder($competitionId, $user->id)),
            );
        });
    }

    protected function imageColumn(): string
    {
        return 'avatar_path';
    }

    protected function imageFolder(): string
    {
        return 'avatars';
    }

    /** Résumé public : nom et photo. */
    public function summary(): array
    {
        return ['id' => $this->id, 'name' => $this->name, 'avatar_url' => $this->imageUrl()];
    }

    public function isAdmin(): bool
    {
        return $this->role === self::ROLE_ADMIN;
    }

    public function isManager(): bool
    {
        return $this->role === self::ROLE_MANAGER;
    }

    /** Seuls les managers et les administrateurs organisent des compétitions. */
    public function canOrganize(): bool
    {
        return $this->isManager() || $this->isAdmin();
    }

    public function teams(): HasMany
    {
        return $this->hasMany(Team::class, 'owner_id');
    }

    public function documents(): HasMany
    {
        return $this->hasMany(CompetitionDocument::class);
    }

    public function competitions(): HasMany
    {
        return $this->hasMany(Competition::class, 'owner_id');
    }
}
