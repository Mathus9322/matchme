<?php

namespace App\Http\Controllers;

use App\Models\FriendlyRequest;
use App\Models\Game;
use App\Models\Team;
use App\Models\User;
use App\Notifications\FriendlyRequestUpdated;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Matchs amicaux entre coachs : l'un propose, l'autre accepte (le match est alors programmé) ou refuse.
 */
class FriendlyRequestController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $teamIds = Team::query()->managedBy($user)->pluck('id');

        $requests = FriendlyRequest::query()
            ->with(['team.coach', 'opponent.coach', 'proposer'])
            ->where(fn ($q) => $q->whereIn('team_id', $teamIds)->orWhereIn('opponent_id', $teamIds))
            ->orderByRaw("status = 'pending' desc")
            ->latest()
            ->limit(50)
            ->get();

        return response()->json(['data' => $requests->map(fn (FriendlyRequest $r) => $this->present($r, $user))]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        $validated = $request->validate([
            'team_id' => ['required', 'integer', 'exists:teams,id'],
            'opponent_id' => ['required', 'integer', 'exists:teams,id', 'different:team_id'],
            'round' => ['nullable', 'string', 'max:60'],
            'scheduled_at' => ['nullable', 'date', 'after:now'],
            'message' => ['nullable', 'string', 'max:280'],
        ], [
            'opponent_id.different' => 'Choisissez une autre équipe que la vôtre.',
            'scheduled_at.after' => 'La date du match doit être dans le futur.',
        ]);

        $team = Team::findOrFail($validated['team_id']);
        abort_unless($team->isManagedBy($user), 403, 'Vous ne pouvez proposer un match que pour une équipe que vous gérez.');
        $opponent = Team::findOrFail($validated['opponent_id']);

        $duplicate = FriendlyRequest::query()
            ->where('status', FriendlyRequest::STATUS_PENDING)
            ->where(fn ($q) => $q
                ->where(fn ($q) => $q->where('team_id', $team->id)->where('opponent_id', $opponent->id))
                ->orWhere(fn ($q) => $q->where('team_id', $opponent->id)->where('opponent_id', $team->id)))
            ->exists();
        abort_if($duplicate, 422, 'Une proposition est déjà en attente entre ces deux équipes.');

        $friendly = FriendlyRequest::create([...$validated, 'proposed_by' => $user->id, 'status' => FriendlyRequest::STATUS_PENDING]);
        $this->notify($friendly, $opponent);

        return response()->json(['data' => $this->present($friendly, $user)], 201);
    }

    public function accept(Request $request, FriendlyRequest $friendly): JsonResponse
    {
        $user = $request->user();
        $this->authorizeAnswer($friendly, $user);

        DB::transaction(function () use ($friendly) {
            $game = Game::create([
                // Le coach qui a proposé le match l'arbitre ; chaque coach compose sa feuille de match.
                'owner_id' => $friendly->proposed_by,
                'team_a_id' => $friendly->team_id,
                'team_b_id' => $friendly->opponent_id,
                'round' => $friendly->round ?: 'Match amical',
                'scheduled_at' => $friendly->scheduled_at,
            ]);
            $friendly->update(['status' => FriendlyRequest::STATUS_ACCEPTED, 'game_id' => $game->id, 'answered_at' => now()]);
        });
        $friendly->proposer->notify(new FriendlyRequestUpdated($friendly));

        return response()->json(['data' => $this->present($friendly, $user)]);
    }

    public function decline(Request $request, FriendlyRequest $friendly): JsonResponse
    {
        $user = $request->user();
        $this->authorizeAnswer($friendly, $user);

        $friendly->update(['status' => FriendlyRequest::STATUS_DECLINED, 'answered_at' => now()]);
        $friendly->proposer->notify(new FriendlyRequestUpdated($friendly));

        return response()->json(['data' => $this->present($friendly, $user)]);
    }

    public function cancel(Request $request, FriendlyRequest $friendly): JsonResponse
    {
        $user = $request->user();
        abort_unless($friendly->team->isManagedBy($user), 403, 'Vous ne pouvez pas annuler cette proposition.');
        abort_unless($friendly->isPending(), 422, 'Cette proposition a déjà reçu une réponse.');

        $friendly->update(['status' => FriendlyRequest::STATUS_CANCELLED, 'answered_at' => now()]);
        $this->notify($friendly, $friendly->opponent);

        return response()->json(['data' => $this->present($friendly, $user)]);
    }

    private function authorizeAnswer(FriendlyRequest $friendly, User $user): void
    {
        abort_unless($friendly->opponent->isManagedBy($user), 403, 'Seul le coach de l’équipe invitée peut répondre.');
        abort_unless($friendly->isPending(), 422, 'Cette proposition a déjà reçu une réponse.');
    }

    /** Prévient le coach de l'équipe (à défaut son manager). */
    private function notify(FriendlyRequest $friendly, Team $team): void
    {
        ($team->coach ?? $team->owner)?->notify(new FriendlyRequestUpdated($friendly));
    }

    /** @return array<string, mixed> */
    private function present(FriendlyRequest $r, User $user): array
    {
        $r->loadMissing(['team.coach', 'opponent.coach', 'proposer']);
        $side = fn (Team $t) => ['id' => $t->id, 'name' => $t->name, 'logo_url' => $t->imageUrl(), 'coach' => $t->coach?->summary()];
        $incoming = $r->opponent->isManagedBy($user) && ! $r->team->isManagedBy($user);

        return [
            'id' => $r->id,
            'team' => $side($r->team),
            'opponent' => $side($r->opponent),
            'proposer' => $r->proposer->summary(),
            'round' => $r->round,
            'scheduled_at' => $r->scheduled_at,
            'message' => $r->message,
            'status' => $r->status,
            'game_id' => $r->game_id,
            'direction' => $incoming ? 'incoming' : 'outgoing',
            'can_answer' => $r->isPending() && $r->opponent->isManagedBy($user),
            'can_cancel' => $r->isPending() && $r->team->isManagedBy($user),
            'created_at' => $r->created_at,
        ];
    }
}
