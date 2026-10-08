<?php

namespace App\Http\Resources;

use App\Models\Competition;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Competition */
class CompetitionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'description' => $this->description,
            'starts_on' => $this->starts_on?->format('Y-m-d'),
            'ends_on' => $this->ends_on?->format('Y-m-d'),
            'status' => $this->status,
            'format' => $this->format,
            'owner' => $this->whenLoaded('owner', fn () => $this->owner->summary()),
            'teams_count' => $this->whenCounted('teams'),
            'games_count' => $this->whenCounted('games'),
            'teams' => TeamResource::collection($this->whenLoaded('teams')),
            'games' => GameResource::collection($this->whenLoaded('games')),
            'scoring' => $this->scale(),
            'rubrics' => $this->whenLoaded('rubrics', fn () => $this->rubrics->map->toData()),
            'groups' => $this->whenLoaded('groups', fn () => $this->groups->map(fn ($group) => ['id' => $group->id, 'name' => $group->name])),
            'can_manage' => $this->isManagedBy($request->user('sanctum')),
            'created_at' => $this->created_at,
        ];
    }
}
