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
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

class AdminController extends Controller
{
    public function stats(Request $request): JsonResponse
    {
        $weeks = (int) ($request->validate(['weeks' => ['nullable', 'integer', 'in:4,12,26,52']])['weeks'] ?? 12);

        return response()->json(['data' => [
            'users' => User::count(),
            'managers' => User::where('role', User::ROLE_MANAGER)->count(),
            'competitions' => Competition::count(),
            'teams' => Team::count(),
            'players' => Player::count(),
            'games' => Game::count(),
            'live_games' => Game::where('status', Game::STATUS_LIVE)->count(),
            'activity' => $this->activity($weeks),
            'games_by_status' => $this->countBy(Game::query(), 'status', [Game::STATUS_SCHEDULED, Game::STATUS_LIVE, Game::STATUS_FINISHED]),
            'competitions_by_status' => $this->countBy(Competition::query(), 'status', Competition::STATUSES),
            'users_by_role' => $this->countBy(User::query(), 'role', User::ROLES),
        ]]);
    }

    /** Matchs terminés et nouveaux comptes par semaine (lundi), des plus anciennes aux plus récentes. */
    private function activity(int $weeks): array
    {
        $start = Carbon::now()->startOfWeek()->subWeeks($weeks - 1);
        $week = fn ($date) => Carbon::parse($date)->startOfWeek()->toDateString();
        $games = Game::where('finished_at', '>=', $start)->pluck('finished_at')->countBy($week);
        $users = User::where('created_at', '>=', $start)->pluck('created_at')->countBy($week);

        return collect(range(0, $weeks - 1))->map(function (int $i) use ($start, $games, $users) {
            $key = $start->copy()->addWeeks($i)->toDateString();

            return ['week' => $key, 'games' => $games->get($key, 0), 'users' => $users->get($key, 0)];
        })->all();
    }

    /** Nombre de lignes par valeur de la colonne, dans l'ordre donné (0 pour les valeurs absentes). */
    private function countBy($query, string $column, array $values): array
    {
        $counts = $query->selectRaw("{$column} as value, count(*) as total")->groupBy($column)->pluck('total', 'value');

        return collect($values)->map(fn ($value) => ['key' => $value, 'count' => (int) $counts->get($value, 0)])->all();
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
