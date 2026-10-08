<?php

namespace App\Http\Controllers;

use App\Models\Team;
use App\Models\User;
use App\Notifications\CoachAssigned;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

/**
 * Utilisateurs sous la gestion d'un manager : les coachs de ses équipes et des équipes inscrites à ses compétitions.
 * Il crée leurs comptes, les modifie, change le coach de ces équipes et peut supprimer un compte de coach.
 */
class ManagedUserController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $manager = $request->user();
        $teams = $this->controlledTeams($manager);

        $coaches = User::query()
            ->whereIn('id', $teams->pluck('coach_id')->filter()->unique())
            ->with('coachedTeams')
            ->orderBy('name')
            ->get();

        return response()->json([
            'data' => $coaches->map(fn (User $user) => $this->present($user, $manager, $teams)),
            'teams' => $teams->map(fn (Team $team) => [
                'id' => $team->id,
                'name' => $team->name,
                'logo_url' => $team->imageUrl(),
                'coach' => $team->coach ? [...$team->coach->summary(), 'email' => $team->coach->email] : null,
                // Équipe d'un autre manager, inscrite à l'une de mes compétitions.
                'external' => ! $manager->isAdmin() && $team->owner_id !== $manager->id,
                'owner' => $team->owner?->summary(),
            ])->values(),
        ]);
    }

    /** Crée le compte d'un coach et lui confie une équipe. */
    public function store(Request $request): JsonResponse
    {
        $manager = $request->user();
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:80'],
            'email' => ['required', 'email', 'max:120', 'unique:users,email'],
            'password' => ['required', Password::min(8)],
            'team_id' => ['required', 'integer', Rule::in($this->controlledTeams($manager)->pluck('id'))],
        ], [
            'email.unique' => 'Un compte existe déjà avec cet e-mail : désignez-le coach depuis la liste des équipes.',
            'team_id.in' => 'Choisissez une équipe que vous gérez.',
        ]);

        $user = DB::transaction(function () use ($validated) {
            $user = User::create([...collect($validated)->only(['name', 'email', 'password'])->all(), 'role' => User::ROLE_USER]);
            Team::whereKey($validated['team_id'])->update(['coach_id' => $user->id]);

            return $user;
        });
        $team = Team::find($validated['team_id']);
        $user->notify(new CoachAssigned($team));

        return response()->json(['data' => $this->present($user->load('coachedTeams'), $manager, $this->controlledTeams($manager))], 201);
    }

    /** Corrige le nom, l'e-mail ou réinitialise le mot de passe d'un coach. */
    public function update(Request $request, User $user): JsonResponse
    {
        $manager = $request->user();
        $this->authorizeAccount($manager, $user);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:80'],
            'email' => ['required', 'email', 'max:120', Rule::unique('users')->ignore($user->id)],
            'password' => ['nullable', Password::min(8)],
        ]);
        if (empty($validated['password'])) {
            unset($validated['password']);
        }
        $user->update($validated);

        return response()->json(['data' => $this->present($user->load('coachedTeams'), $manager, $this->controlledTeams($manager))]);
    }

    /** Supprime le compte d'un coach : ses équipes reviennent à leur manager, qui en redevient le coach. */
    public function destroy(Request $request, User $user): Response
    {
        $manager = $request->user();
        $this->authorizeAccount($manager, $user);

        $controlled = $this->controlledTeams($manager)->pluck('id');
        abort_if(
            $user->coachedTeams()->whereNotIn('id', $controlled)->exists(),
            422,
            'Ce coach entraîne aussi des équipes d’autres managers : retirez-le de vos équipes au lieu de supprimer son compte.',
        );

        DB::transaction(function () use ($user) {
            Team::where('coach_id', $user->id)->update(['coach_id' => DB::raw('owner_id')]);
            $user->delete();
        });

        return response()->noContent();
    }

    /** Change le coach d'une équipe sous mon autorité (réaffecter ou retirer un coach). */
    public function assign(Request $request, Team $team): JsonResponse
    {
        $manager = $request->user();
        abort_unless($team->isControlledBy($manager), 403, 'Vous ne gérez pas cette équipe.');
        $validated = $request->validate(['coach_id' => ['required', 'integer', 'exists:users,id']], ['coach_id.required' => 'Une équipe doit toujours avoir un coach.']);

        if ((int) $validated['coach_id'] !== $team->coach_id) {
            $team->update(['coach_id' => $validated['coach_id']]);
            $coach = $team->coach()->first();
            if ($coach && $coach->id !== $manager->id) {
                $coach->notify(new CoachAssigned($team));
            }
        }

        return $this->index($request);
    }

    /** Seuls les comptes de simples utilisateurs, coachs d'au moins une de mes équipes, sont modifiables. */
    private function authorizeAccount(User $manager, User $user): void
    {
        abort_if($user->is($manager), 422, 'Modifiez votre propre compte depuis votre profil.');
        if ($manager->isAdmin()) {
            return;
        }
        abort_unless($this->controlledTeams($manager)->contains('coach_id', $user->id), 403, 'Cet utilisateur n’est pas sous votre gestion.');
        abort_unless($user->role === User::ROLE_USER, 403, 'Ce compte appartient à un manager ou un administrateur : vous ne pouvez pas le modifier.');
    }

    private function controlledTeams(User $manager)
    {
        return Team::query()->controlledBy($manager)->with(['coach', 'owner'])->orderBy('name')->get();
    }

    /** @return array<string, mixed> */
    private function present(User $user, User $manager, $teams): array
    {
        $mine = $teams->where('coach_id', $user->id);

        return [
            ...$user->summary(),
            'email' => $user->email,
            'role' => $user->role,
            'teams' => $mine->map(fn (Team $t) => ['id' => $t->id, 'name' => $t->name])->values(),
            // Équipes entraînées chez d'autres managers (hors de mon autorité).
            'other_teams' => $user->coachedTeams->whereNotIn('id', $teams->pluck('id'))->count(),
            'can_edit' => ! $user->is($manager) && ($manager->isAdmin() || $user->role === User::ROLE_USER),
            'created_at' => $user->created_at,
        ];
    }
}
