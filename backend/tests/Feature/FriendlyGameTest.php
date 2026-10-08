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
        $user = Sanctum::actingAs(User::factory()->manager()->create());
        $existing = $this->teamWithPlayers($user->id, 'Les Comètes');

        $game = $this->postJson('/api/games/friendly', [
            'team_a' => ['name' => 'Les Amis', 'players' => ['Alice', 'Bob', 'Chloé', 'David'], 'captain' => 1],
            'team_b' => ['id' => $existing->id],
            'start' => true, 'uses_buzzer' => false,
        ])
            ->assertCreated()
            ->assertJsonPath('data.friendly', true)
            ->assertJsonPath('data.competition', null)
            ->assertJsonPath('data.status', 'live')
            ->assertJsonPath('data.phase', 'first_half')
            ->assertJsonPath('data.can_manage', true)
            // Bob, capitaine, joue en première position.
            ->assertJsonPath('data.team_a.players.0.name', 'Bob')
            ->assertJsonPath('data.team_a.players.0.is_captain', true)
            ->assertJsonPath('data.team_a.players.1.name', 'Alice')
            ->json('data');

        $this->assertDatabaseHas('teams', ['name' => 'Les Amis', 'owner_id' => $user->id]);

        $this->postJson("/api/games/{$game['id']}/events", ['team_id' => $existing->id, 'player_id' => null, 'rubric_id' => null, 'points' => 30])
            ->assertJsonPath('data.team_b.score', 30);

        $this->getJson('/api/games?friendly=1&mine=1')->assertJsonCount(1, 'data');
    }

    public function test_only_the_creator_or_an_admin_can_manage_a_friendly(): void
    {
        Sanctum::actingAs(User::factory()->manager()->create());
        $id = $this->postJson('/api/games/friendly', [
            'team_a' => ['name' => 'A', 'players' => ['a1', 'a2', 'a3', 'a4']],
            'team_b' => ['name' => 'B', 'players' => ['b1', 'b2', 'b3', 'b4']],
        ])->assertJsonPath('data.status', 'scheduled')->json('data.id');

        Sanctum::actingAs(User::factory()->create());
        $this->postJson("/api/games/{$id}/start", ['uses_buzzer' => false])->assertForbidden();
        $this->getJson("/api/games/{$id}")->assertJsonPath('data.can_manage', false);

        Sanctum::actingAs(User::factory()->create(['role' => 'admin']));
        $this->postJson("/api/games/{$id}/start", ['uses_buzzer' => false])->assertOk();
    }

    public function test_regular_users_cannot_create_friendlies(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $this->postJson('/api/games/friendly', [
            'team_a' => ['name' => 'A', 'players' => ['a1', 'a2', 'a3', 'a4']],
            'team_b' => ['name' => 'B', 'players' => ['b1', 'b2', 'b3', 'b4']],
        ])->assertForbidden();
    }

    public function test_quick_teams_require_a_name_and_players(): void
    {
        Sanctum::actingAs(User::factory()->manager()->create());
        $this->postJson('/api/games/friendly', ['team_a' => ['name' => 'A'], 'team_b' => ['players' => ['b']]])
            ->assertJsonValidationErrors(['team_a.players', 'team_b.name']);
    }

    public function test_an_existing_team_can_be_lined_up_at_creation(): void
    {
        $manager = Sanctum::actingAs(User::factory()->manager()->create());
        $team = $this->teamWithPlayers($manager->id, 'Les Comètes', 7);
        $ids = $team->players->pluck('id');

        $this->postJson('/api/games/friendly', [
            'team_a' => ['name' => 'A', 'players' => ['a1', 'a2', 'a3', 'a4']],
            'team_b' => ['id' => $team->id, 'starters' => [$ids[6], $ids[0], $ids[1], $ids[2]], 'substitutes' => [$ids[5]]],
            'start' => true, 'uses_buzzer' => false,
        ])
            ->assertCreated()
            ->assertJsonCount(5, 'data.team_b.players')
            // Le capitaine (joueur 1) passe en tête, les autres titulaires gardent l'ordre choisi.
            ->assertJsonPath('data.team_b.players.0.name', 'Les Comètes joueur 1')
            ->assertJsonPath('data.team_b.players.1.name', 'Les Comètes joueur 7')
            ->assertJsonPath('data.team_b.players.1.role', 'starter')
            ->assertJsonPath('data.team_b.players.4.name', 'Les Comètes joueur 6')
            ->assertJsonPath('data.team_b.players.4.role', 'substitute');
    }

    public function test_the_captain_must_start(): void
    {
        $manager = Sanctum::actingAs(User::factory()->manager()->create());
        $team = $this->teamWithPlayers($manager->id, 'Les Comètes', 6);
        $ids = $team->players->pluck('id');

        $this->postJson('/api/games/friendly', [
            'team_a' => ['name' => 'A', 'players' => ['a1', 'a2', 'a3', 'a4']],
            'team_b' => ['id' => $team->id, 'starters' => [$ids[1], $ids[2], $ids[3], $ids[4]], 'substitutes' => [$ids[0]]],
        ])->assertJsonValidationErrors('team_b.starters');
    }

    public function test_an_existing_team_lineup_is_validated(): void
    {
        $manager = Sanctum::actingAs(User::factory()->manager()->create());
        $team = $this->teamWithPlayers($manager->id, 'Les Comètes', 6);
        $other = $this->teamWithPlayers($manager->id, 'Autres');
        $ids = $team->players->pluck('id');

        $this->postJson('/api/games/friendly', [
            'team_a' => ['id' => $other->id, 'starters' => [$ids[0], $ids[1], $ids[2], $ids[3]]],
            'team_b' => ['id' => $team->id, 'starters' => [$ids[0], $ids[1], $ids[2]], 'substitutes' => [$ids[0]]],
        ])->assertJsonValidationErrors(['team_a.starters.0', 'team_b.starters', 'team_b.substitutes.0']);
    }

    public function test_a_direct_friendly_only_uses_the_managers_own_teams(): void
    {
        $manager = Sanctum::actingAs(User::factory()->manager()->create());
        $mine = $this->teamWithPlayers($manager->id, 'Mes Lynx');
        $foreign = $this->teamWithPlayers(User::factory()->manager()->create()->id, 'Comètes d’ailleurs');

        $this->postJson('/api/games/friendly', ['team_a' => ['id' => $mine->id], 'team_b' => ['id' => $foreign->id]])
            ->assertJsonValidationErrors('team_b.id');
        $this->postJson('/api/games/friendly', ['team_a' => ['id' => $mine->id], 'team_b' => ['name' => 'Rapides', 'players' => ['a', 'b', 'c', 'd']]])
            ->assertCreated();

        // L'administrateur n'est pas limité.
        Sanctum::actingAs(User::factory()->admin()->create());
        $this->postJson('/api/games/friendly', ['team_a' => ['id' => $mine->id], 'team_b' => ['id' => $foreign->id]])->assertCreated();
    }
}
