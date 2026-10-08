<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class FriendlyGameTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_user_can_create_and_score_a_friendly_with_quick_teams(): void
    {
        $user = Sanctum::actingAs(User::factory()->create());
        $existing = $this->teamWithPlayers(User::factory()->create()->id, 'Les Comètes');

        $game = $this->postJson('/api/games/friendly', [
            'team_a' => ['name' => 'Les Amis', 'players' => ['Alice', 'Bob', 'Chloé', 'David']],
            'team_b' => ['id' => $existing->id],
            'start' => true,
        ])
            ->assertCreated()
            ->assertJsonPath('data.friendly', true)
            ->assertJsonPath('data.competition', null)
            ->assertJsonPath('data.status', 'live')
            ->assertJsonPath('data.phase', 'first_half')
            ->assertJsonPath('data.can_manage', true)
            ->assertJsonPath('data.team_a.players.1.name', 'Bob')
            ->json('data');

        $this->assertDatabaseHas('teams', ['name' => 'Les Amis', 'owner_id' => $user->id]);

        $this->postJson("/api/games/{$game['id']}/events", ['team_id' => $existing->id, 'points' => 30])
            ->assertJsonPath('data.team_b.score', 30);

        $this->getJson('/api/games?friendly=1&mine=1')->assertJsonCount(1, 'data');
    }

    public function test_only_the_creator_or_an_admin_can_manage_a_friendly(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $id = $this->postJson('/api/games/friendly', [
            'team_a' => ['name' => 'A', 'players' => ['a1', 'a2', 'a3', 'a4']],
            'team_b' => ['name' => 'B', 'players' => ['b1', 'b2', 'b3', 'b4']],
        ])->assertJsonPath('data.status', 'scheduled')->json('data.id');

        Sanctum::actingAs(User::factory()->create());
        $this->postJson("/api/games/{$id}/start")->assertForbidden();
        $this->getJson("/api/games/{$id}")->assertJsonPath('data.can_manage', false);

        Sanctum::actingAs(User::factory()->create(['role' => 'admin']));
        $this->postJson("/api/games/{$id}/start")->assertOk();
    }

    public function test_quick_teams_require_a_name_and_players(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $this->postJson('/api/games/friendly', ['team_a' => ['name' => 'A'], 'team_b' => ['players' => ['b']]])
            ->assertJsonValidationErrors(['team_a.players', 'team_b.name']);
    }
}
