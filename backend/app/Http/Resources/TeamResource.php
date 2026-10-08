<?php

namespace App\Http\Resources;

use App\Models\Team;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Team */
class TeamResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $user = $request->user('sanctum');

        return [
            'id' => $this->id,
            'name' => $this->name,
            'city' => $this->city,
            'logo_url' => $this->imageUrl(),
            'owner' => $this->whenLoaded('owner', fn () => $this->owner->summary()),
            'coach' => $this->whenLoaded('coach', fn () => $this->coach?->summary()),
            'players' => $this->whenLoaded('players', fn () => $this->players->map(fn ($player) => [
                'id' => $player->id,
                'name' => $player->name,
                'photo_url' => $player->imageUrl(),
                'is_captain' => $player->is_captain,
            ])),
            'players_count' => $this->whenCounted('players'),
            'group_id' => $this->whenPivotLoaded('competition_team', fn () => $this->pivot->group_id),
            'can_manage' => $this->isManagedBy($user),
            'is_coach' => $user !== null && $user->id === $this->coach_id,
            'created_at' => $this->created_at,
        ];
    }
}
