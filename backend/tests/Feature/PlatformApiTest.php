<?php

namespace Tests\Feature;

use App\Models\Competition;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PlatformApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_visitor_can_register_and_fetch_their_profile(): void
    {
        $token = $this->postJson('/api/auth/register', [
            'name' => 'Awa',
            'email' => 'awa@example.com',
            'password' => 'secret-pass',
            'password_confirmation' => 'secret-pass',
        ])->assertCreated()->assertJsonPath('user.role', 'user')->json('token');

        $this->withToken($token)->getJson('/api/auth/me')->assertOk()->assertJsonPath('data.email', 'awa@example.com');
    }

    public function test_login_rejects_a_wrong_password(): void
    {
        User::factory()->create(['email' => 'awa@example.com']);

        $this->postJson('/api/auth/login', ['email' => 'awa@example.com', 'password' => 'nope'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('email');
    }

    public function test_full_competition_flow_with_live_scoring(): void
    {
        $manager = Sanctum::actingAs(User::factory()->manager()->create());

        $teamA = $this->postJson('/api/teams', ['name' => 'Les Lynx', 'coach_id' => $manager->id, 'players' => [['name' => 'Alice'], ['name' => 'Bob'], ['name' => 'Chloé'], ['name' => 'David']], 'captain' => 0])
            ->assertCreated()->assertJsonCount(4, 'data.players')->json('data');
        $teamB = $this->postJson('/api/teams', ['name' => 'Les Comètes', 'coach_id' => $manager->id, 'players' => [['name' => 'Emma'], ['name' => 'Farid'], ['name' => 'Gaël'], ['name' => 'Hana']], 'captain' => 0])->json('data');

        $competitionId = $this->postJson('/api/competitions', ['name' => 'Coupe', 'status' => 'open'])
            ->assertCreated()->json('data.id');

        $this->postJson("/api/competitions/{$competitionId}/teams", ['team_ids' => [$teamA['id'], $teamB['id']]])
            ->assertOk()->assertJsonPath('attached', 2);
        $this->postJson("/api/competitions/{$competitionId}/teams", ['team_ids' => [$teamA['id']]])->assertJsonPath('attached', 0);

        $gameId = $this->postJson("/api/competitions/{$competitionId}/games", [
            'team_a_id' => $teamA['id'], 'team_b_id' => $teamB['id'], 'round' => 'Finale',
        ])->assertCreated()->assertJsonPath('data.status', 'scheduled')->json('data.id');

        $this->postJson("/api/games/{$gameId}/events", ['team_id' => $teamA['id'], 'points' => 10])->assertUnprocessable();
        $this->postJson("/api/games/{$gameId}/start", ['uses_buzzer' => false])->assertOk()->assertJsonPath('data.status', 'live');

        $alice = $teamA['players'][0]['id'];
        $this->postJson("/api/games/{$gameId}/events", ['team_id' => $teamA['id'], 'player_id' => $alice, 'points' => 40])->assertOk();
        $this->postJson("/api/games/{$gameId}/events", ['team_id' => $teamA['id'], 'points' => 10])->assertOk();
        $this->postJson("/api/games/{$gameId}/events", ['team_id' => $teamB['id'], 'points' => 20])
            ->assertJsonPath('data.team_a.score', 50)
            ->assertJsonPath('data.team_a.bonus', 10)
            ->assertJsonPath('data.team_a.players.0.score', 40)
            ->assertJsonPath('data.team_b.score', 20);

        // Un joueur de l'autre équipe est refusé.
        $this->postJson("/api/games/{$gameId}/events", ['team_id' => $teamB['id'], 'player_id' => $alice, 'points' => 10])
            ->assertJsonValidationErrors('player_id');

        $this->deleteJson("/api/games/{$gameId}/events/last")->assertJsonPath('data.team_b.score', 0);
        $this->toSecondHalf($gameId);
        $this->postJson("/api/games/{$gameId}/finish")->assertJsonPath('data.status', 'finished');

        // Lecture publique du classement.
        $this->app['auth']->forgetGuards();
        $this->withHeaders(['Authorization' => ''])->getJson("/api/competitions/{$competitionId}")
            ->assertOk()
            ->assertJsonPath('standings.0.team.name', 'Les Lynx')
            ->assertJsonPath('standings.0.points', 3)
            ->assertJsonPath('data.can_manage', false);
    }

    public function test_games_require_teams_registered_in_the_competition(): void
    {
        $user = Sanctum::actingAs(User::factory()->create());
        $competition = Competition::create(['owner_id' => $user->id, 'name' => 'Coupe', 'status' => 'open']);
        Team::insert([
            ['owner_id' => $user->id, 'name' => 'A'],
            ['owner_id' => $user->id, 'name' => 'B'],
        ]);

        $this->postJson("/api/competitions/{$competition->id}/games", ['team_a_id' => 1, 'team_b_id' => 2])
            ->assertJsonValidationErrors(['team_a_id', 'team_b_id']);
    }

    public function test_only_the_organizer_or_an_admin_can_score(): void
    {
        $owner = User::factory()->create();
        $competition = Competition::create(['owner_id' => $owner->id, 'name' => 'Coupe', 'status' => 'ongoing']);
        $a = Team::create(['owner_id' => $owner->id, 'name' => 'A']);
        $b = Team::create(['owner_id' => $owner->id, 'name' => 'B']);
        $competition->teams()->attach([$a->id, $b->id]);
        $game = $competition->games()->create(['team_a_id' => $a->id, 'team_b_id' => $b->id, 'status' => 'live']);

        Sanctum::actingAs(User::factory()->create());
        $this->postJson("/api/games/{$game->id}/events", ['team_id' => $a->id, 'points' => 10])->assertForbidden();

        Sanctum::actingAs(User::factory()->create(['role' => 'admin']));
        $this->postJson("/api/games/{$game->id}/events", ['team_id' => $a->id, 'points' => 10])->assertOk();
    }

    public function test_team_owner_can_register_only_into_open_competitions(): void
    {
        $organizer = User::factory()->create();
        $open = Competition::create(['owner_id' => $organizer->id, 'name' => 'Ouverte', 'status' => 'open']);
        $closed = Competition::create(['owner_id' => $organizer->id, 'name' => 'Fermée', 'status' => 'ongoing']);

        $captain = Sanctum::actingAs(User::factory()->create());
        $team = Team::create(['owner_id' => $captain->id, 'name' => 'Mon équipe']);

        $this->postJson("/api/competitions/{$open->id}/teams", ['team_id' => $team->id])->assertOk();
        $this->postJson("/api/competitions/{$closed->id}/teams", ['team_id' => $team->id])->assertForbidden();

        // Une sélection contenant l'équipe d'un autre est refusée en bloc.
        $other = Team::create(['owner_id' => $organizer->id, 'name' => 'Autre']);
        $this->postJson("/api/competitions/{$open->id}/teams", ['team_ids' => [$team->id, $other->id]])->assertForbidden();
        $this->assertSame(1, $open->teams()->count());
    }

    public function test_regular_users_only_access_public_pages(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $this->postJson('/api/teams', ['name' => 'X', 'players' => [['name' => 'a'], ['name' => 'b'], ['name' => 'c'], ['name' => 'd']]])->assertForbidden();
        $this->getJson('/api/manage/overview')->assertForbidden();
        $this->getJson('/api/competitions')->assertOk();
        $this->getJson('/api/games?status=live')->assertOk();
    }

    public function test_manager_overview_is_scoped_to_their_data(): void
    {
        $manager = Sanctum::actingAs(User::factory()->manager()->create());
        Competition::create(['owner_id' => $manager->id, 'name' => 'Mienne', 'status' => 'ongoing']);
        Competition::create(['owner_id' => User::factory()->manager()->create()->id, 'name' => 'Autre', 'status' => 'ongoing']);

        $this->getJson('/api/manage/overview')->assertOk()
            ->assertJsonPath('stats.competitions', 1)
            ->assertJsonPath('stats.ongoing_competitions', 1);

        Sanctum::actingAs(User::factory()->admin()->create());
        $this->getJson('/api/manage/overview')->assertJsonPath('stats.competitions', 2);
    }

    public function test_updating_a_team_syncs_its_players(): void
    {
        $manager = Sanctum::actingAs(User::factory()->manager()->create());
        $team = $this->postJson('/api/teams', ['name' => 'Lynx', 'coach_id' => $manager->id, 'players' => [['name' => 'Alice'], ['name' => 'Bob'], ['name' => 'Chloé'], ['name' => 'David']], 'captain' => 0])->json('data');

        $this->putJson("/api/teams/{$team['id']}", [
            'name' => 'Lynx',
            'players' => [['id' => $team['players'][1]['id'], 'name' => 'Bobby'], ['name' => 'Eva'], ['name' => 'Fatou'], ['name' => 'Gora']],
            'captain' => 2,
        ])
            ->assertJsonCount(4, 'data.players')
            ->assertJsonPath('data.players.0.is_captain', false)
            ->assertJsonPath('data.players.2.is_captain', true)
            ->assertJsonPath('data.players.0.id', $team['players'][1]['id'])
            ->assertJsonPath('data.players.0.name', 'Bobby')
            ->assertJsonPath('data.players.1.name', 'Eva');

        // Chaque équipe doit avoir un capitaine parmi ses joueurs.
        $this->putJson("/api/teams/{$team['id']}", ['name' => 'Lynx', 'players' => [['name' => 'a'], ['name' => 'b'], ['name' => 'c'], ['name' => 'd']]])
            ->assertJsonValidationErrors('captain');
        $this->putJson("/api/teams/{$team['id']}", ['name' => 'Lynx', 'players' => [['name' => 'a'], ['name' => 'b'], ['name' => 'c'], ['name' => 'd']], 'captain' => 4])
            ->assertJsonValidationErrors('captain');
    }

    public function test_only_managers_and_admins_can_create_competitions(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $this->postJson('/api/competitions', ['name' => 'Coupe', 'status' => 'open'])->assertForbidden();

        Sanctum::actingAs(User::factory()->manager()->create());
        $this->postJson('/api/competitions', ['name' => 'Coupe', 'status' => 'open'])->assertCreated();

        Sanctum::actingAs(User::factory()->admin()->create());
        $this->postJson('/api/competitions', ['name' => 'Coupe 2', 'status' => 'open'])->assertCreated();
    }

    public function test_a_manager_cannot_manage_another_managers_competition(): void
    {
        $owner = User::factory()->manager()->create();
        $competition = Competition::create(['owner_id' => $owner->id, 'name' => 'Coupe', 'status' => 'open']);

        Sanctum::actingAs(User::factory()->manager()->create());
        $this->putJson("/api/competitions/{$competition->id}", ['name' => 'Piratée', 'status' => 'open'])->assertForbidden();
    }

    public function test_admin_can_promote_a_user_to_manager(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs(User::factory()->admin()->create());

        $this->putJson("/api/admin/users/{$user->id}", ['name' => $user->name, 'email' => $user->email, 'role' => 'manager'])
            ->assertOk()
            ->assertJsonPath('data.role', 'manager')
            ->assertJsonPath('data.can_organize', true);
        $this->getJson('/api/admin/users?role=manager')->assertJsonCount(1, 'data');
    }

    public function test_admin_endpoints_are_restricted(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $this->getJson('/api/admin/stats')->assertForbidden();

        $admin = Sanctum::actingAs(User::factory()->create(['role' => 'admin']));
        $this->getJson('/api/admin/stats')->assertOk()->assertJsonPath('data.users', 2)
            ->assertJsonCount(12, 'data.activity')
            ->assertJsonPath('data.activity.11.users', 2)
            ->assertJsonPath('data.users_by_role.0', ['key' => 'user', 'count' => 1])
            ->assertJsonPath('data.users_by_role.2', ['key' => 'admin', 'count' => 1]);
        $this->getJson('/api/admin/stats?weeks=4')->assertJsonCount(4, 'data.activity');
        $this->getJson('/api/admin/stats?weeks=5')->assertUnprocessable();
        $this->getJson('/api/admin/users')->assertOk()->assertJsonCount(2, 'data');
        $this->deleteJson("/api/admin/users/{$admin->id}")->assertUnprocessable();
    }
}
