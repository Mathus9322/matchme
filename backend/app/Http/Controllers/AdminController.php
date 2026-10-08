<?php

namespace App\Http\Controllers;

use App\Http\Resources\UserResource;
use App\Models\Competition;
use App\Models\Game;
use App\Models\Player;
use App\Models\Team;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

class AdminController extends Controller
{
    public function stats(): JsonResponse
    {
        return response()->json(['data' => [
            'users' => User::count(),
            'managers' => User::where('role', User::ROLE_MANAGER)->count(),
            'competitions' => Competition::count(),
            'teams' => Team::count(),
            'players' => Player::count(),
            'games' => Game::count(),
            'live_games' => Game::where('status', Game::STATUS_LIVE)->count(),
        ]]);
    }

    public function users(Request $request): AnonymousResourceCollection
    {
        $users = User::query()
            ->withCount(['teams', 'competitions'])
            ->when($request->query('role'), fn ($q, $role) => $q->where('role', $role))
            ->when($request->query('search'), fn ($q, $search) => $q->where(fn ($q) => $q
                ->where('name', 'like', "%{$search}%")
                ->orWhere('email', 'like', "%{$search}%")))
            ->orderBy('name')
            ->get();

        return UserResource::collection($users);
    }

    public function updateUser(Request $request, User $user): UserResource
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:80'],
            'email' => ['required', 'email', 'max:120', Rule::unique('users')->ignore($user->id)],
            'role' => ['required', Rule::in(User::ROLES)],
            'password' => ['nullable', Password::min(8)],
        ]);

        abort_if(
            $user->is($request->user()) && $validated['role'] !== User::ROLE_ADMIN,
            422,
            'Vous ne pouvez pas retirer votre propre rôle administrateur.',
        );

        if (empty($validated['password'])) {
            unset($validated['password']);
        }

        $user->update($validated);

        return new UserResource($user->loadCount(['teams', 'competitions']));
    }

    public function destroyUser(Request $request, User $user): Response
    {
        abort_if($user->is($request->user()), 422, 'Vous ne pouvez pas supprimer votre propre compte.');
        $user->delete();

        return response()->noContent();
    }
}
