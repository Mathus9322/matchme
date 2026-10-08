<?php

namespace Tests\Feature;

use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CoachTest extends TestCase
{
    use RefreshDatabase;

    private function players(int $count = 4): array
    {
        return array_map(fn ($i) => ['name' => "Joueur {$i}"], range(1, $count));
    }

    public function test_any_user_can_create_a_space_and_become_manager(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $this->getJson('/api/manage/overview')->assertForbidden();

        $this->postJson('/api/auth/me/space')->assertJsonPath('data.role', 'manager')->assertJsonPath('data.can_organize', true);
        $this->getJson('/api/manage/overview')->assertOk();
    }

    public function test_a_manager_assigns_a_coach_who_manages_the_roster(): void
    {
        $coach = User::factory()->create(['name' => 'Coach Awa']);
        $manager = Sanctum::actingAs(User::factory()->manager()->create());

        $this->postJson('/api/teams', ['name' => 'Sans coach', 'players' => $this->players(), 'captain' => 0])->assertJsonValidationErrors('coach_id');
        $this->getJson('/api/users/search?q=awa')->assertJsonPath('data.0.id', $coach->id);

        $team = $this->postJson('/api/teams', ['name' => 'Lynx', 'coach_id' => $coach->id, 'players' => $this->players(), 'captain' => 0])
            ->assertCreated()->assertJsonPath('data.coach.name', 'Coach Awa')->json('data');
        $this->assertSame(1, $coach->notifications()->count());

        // Le coach gère l'effectif, accède à l'espace de gestion, mais ne crée pas d'équipe et ne change pas de coach.
        Sanctum::actingAs($coach);
        $this->getJson('/api/auth/me')->assertJsonPath('data.is_coach', true);
        $this->getJson('/api/manage/overview')->assertOk()->assertJsonPath('stats.teams', 1);
        $this->getJson('/api/teams?mine=1')->assertJsonCount(1, 'data')->assertJsonPath('data.0.is_coach', true);
        $this->putJson("/api/teams/{$team['id']}", ['name' => 'Lynx', 'players' => $this->players(6), 'captain' => 5])
            ->assertOk()->assertJsonCount(6, 'data.players')->assertJsonPath('data.players.5.is_captain', true);
        $this->putJson("/api/teams/{$team['id']}", ['name' => 'Lynx', 'coach_id' => $manager->id, 'players' => $this->players(), 'captain' => 0])->assertForbidden();
        $this->postJson('/api/teams', ['name' => 'Autre', 'coach_id' => $coach->id, 'players' => $this->players(), 'captain' => 0])->assertForbidden();
        $this->deleteJson("/api/teams/{$team['id']}")->assertForbidden();

        // Le manager garde la main sur tout, y compris l'effectif.
        Sanctum::actingAs($manager);
        $this->putJson("/api/teams/{$team['id']}", ['name' => 'Lynx', 'players' => $this->players(5), 'captain' => 1])->assertOk()->assertJsonCount(5, 'data.players');

        // Un autre utilisateur ne touche pas à l'équipe.
        Sanctum::actingAs(User::factory()->create());
        $this->putJson("/api/teams/{$team['id']}", ['name' => 'Pirate', 'players' => $this->players(), 'captain' => 0])->assertForbidden();
    }

    public function test_two_coaches_set_up_a_friendly_by_invitation(): void
    {
        [$coachA, $coachB] = User::factory()->count(2)->create();
        $teamA = $this->teamWithPlayers(User::factory()->manager()->create()->id, 'Lynx');
        $teamB = $this->teamWithPlayers(User::factory()->manager()->create()->id, 'Comètes');
        $teamA->update(['coach_id' => $coachA->id]);
        $teamB->update(['coach_id' => $coachB->id]);

        Sanctum::actingAs($coachA);
        $this->postJson('/api/friendly-requests', ['team_id' => $teamB->id, 'opponent_id' => $teamA->id])->assertForbidden();
        $id = $this->postJson('/api/friendly-requests', ['team_id' => $teamA->id, 'opponent_id' => $teamB->id, 'scheduled_at' => now()->addDays(3)->toIso8601String(), 'round' => 'Défi'])
            ->assertCreated()->assertJsonPath('data.direction', 'outgoing')->assertJsonPath('data.can_answer', false)->json('data.id');
        $this->postJson('/api/friendly-requests', ['team_id' => $teamA->id, 'opponent_id' => $teamB->id])->assertStatus(422);
        $this->postJson("/api/friendly-requests/{$id}/accept")->assertForbidden();

        Sanctum::actingAs($coachB);
        $this->assertSame(1, $coachB->notifications()->count());
        $this->getJson('/api/friendly-requests')->assertJsonPath('data.0.direction', 'incoming')->assertJsonPath('data.0.can_answer', true);
        $gameId = $this->postJson("/api/friendly-requests/{$id}/accept")->assertOk()->assertJsonPath('data.status', 'accepted')->json('data.game_id');

        $this->getJson("/api/games/{$gameId}")
            ->assertJsonPath('data.friendly', true)
            ->assertJsonPath('data.round', 'Défi')
            ->assertJsonPath('data.status', 'scheduled');
        $this->assertSame(1, $coachA->notifications()->count());

        // Chaque coach compose sa propre feuille de match ; le proposant arbitre.
        $ids = $teamB->players->pluck('id')->all();
        $this->putJson("/api/games/{$gameId}/lineup", ['team_id' => $teamB->id, 'starters' => $ids, 'substitutes' => []])->assertOk();
        $this->postJson("/api/games/{$gameId}/start", ['uses_buzzer' => false])->assertForbidden();
        Sanctum::actingAs($coachA);
        $this->postJson("/api/games/{$gameId}/start", ['uses_buzzer' => false])->assertOk();
    }

    public function test_an_invitation_can_be_declined_or_cancelled(): void
    {
        [$coachA, $coachB] = User::factory()->count(2)->create();
        $teamA = Team::create(['owner_id' => $coachA->id, 'coach_id' => $coachA->id, 'name' => 'A']);
        $teamB = Team::create(['owner_id' => $coachB->id, 'coach_id' => $coachB->id, 'name' => 'B']);

        Sanctum::actingAs($coachA);
        $first = $this->postJson('/api/friendly-requests', ['team_id' => $teamA->id, 'opponent_id' => $teamB->id])->json('data.id');
        Sanctum::actingAs($coachB);
        $this->postJson("/api/friendly-requests/{$first}/decline")->assertJsonPath('data.status', 'declined')->assertJsonPath('data.game_id', null);
        $this->postJson("/api/friendly-requests/{$first}/accept")->assertStatus(422);

        Sanctum::actingAs($coachA);
        $second = $this->postJson('/api/friendly-requests', ['team_id' => $teamA->id, 'opponent_id' => $teamB->id])->assertCreated()->json('data.id');
        $this->postJson("/api/friendly-requests/{$second}/cancel")->assertJsonPath('data.status', 'cancelled');
    }
}
