<?php

namespace App\Http\Controllers;

use App\Http\Resources\CompetitionResource;
use App\Http\Resources\TeamResource;
use App\Http\Resources\UserResource;
use App\Models\Competition;
use App\Models\Player;
use App\Models\Team;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Envoi et suppression des photos de profil, photos de joueurs, logos d'équipe et couvertures de compétition. */
class ImageController extends Controller
{
    private const RULES = ['required', 'image', 'mimes:jpg,jpeg,png,webp,gif', 'max:2048', 'dimensions:max_width=4000,max_height=4000'];

    private const MESSAGES = [
        'image.required' => 'Choisissez une image.',
        'image.image' => 'Le fichier doit être une image.',
        'image.mimes' => 'Formats acceptés : JPG, PNG, WebP ou GIF.',
        'image.max' => 'L’image doit faire au plus 2 Mo.',
        'image.uploaded' => 'L’image n’a pas pu être envoyée (2 Mo maximum).',
        'image.dimensions' => 'L’image est trop grande (4000 px maximum).',
    ];

    public function storeAvatar(Request $request): UserResource
    {
        $request->validate(['image' => self::RULES], self::MESSAGES);
        $request->user()->storeImage($request->file('image'));

        return new UserResource($request->user());
    }

    public function destroyAvatar(Request $request): UserResource
    {
        $request->user()->removeImage();

        return new UserResource($request->user());
    }

    public function storeLogo(Request $request, Team $team): TeamResource
    {
        $this->authorizeTeam($request, $team);
        $request->validate(['image' => self::RULES], self::MESSAGES);
        $team->storeImage($request->file('image'));

        return new TeamResource($team->load(['owner', 'players']));
    }

    public function destroyLogo(Request $request, Team $team): TeamResource
    {
        $this->authorizeTeam($request, $team);
        $team->removeImage();

        return new TeamResource($team->load(['owner', 'players']));
    }

    public function storePlayerPhoto(Request $request, Player $player): JsonResponse
    {
        $this->authorizeTeam($request, $player->team);
        $request->validate(['image' => self::RULES], self::MESSAGES);
        $player->storeImage($request->file('image'));

        return response()->json(['data' => ['id' => $player->id, 'name' => $player->name, 'photo_url' => $player->imageUrl()]]);
    }

    public function destroyPlayerPhoto(Request $request, Player $player): JsonResponse
    {
        $this->authorizeTeam($request, $player->team);
        $player->removeImage();

        return response()->json(['data' => ['id' => $player->id, 'name' => $player->name, 'photo_url' => null]]);
    }

    public function storeCover(Request $request, Competition $competition): CompetitionResource
    {
        abort_unless($competition->isManagedBy($request->user()), 403, 'Vous ne gérez pas cette compétition.');
        $request->validate(['image' => self::RULES], self::MESSAGES);
        $competition->storeImage($request->file('image'));

        return new CompetitionResource($competition->load('owner')->loadCount(['teams', 'games']));
    }

    public function destroyCover(Request $request, Competition $competition): CompetitionResource
    {
        abort_unless($competition->isManagedBy($request->user()), 403, 'Vous ne gérez pas cette compétition.');
        $competition->removeImage();

        return new CompetitionResource($competition->load('owner')->loadCount(['teams', 'games']));
    }

    private function authorizeTeam(Request $request, Team $team): void
    {
        $user = $request->user();
        abort_unless($team->isManagedBy($user), 403, 'Vous ne pouvez pas modifier cette équipe.');
    }
}
