<?php

namespace Tests\Feature;

use App\Models\Competition;
use App\Models\CompetitionGroup;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CompetitionGroupTest extends TestCase
{
    use RefreshDatabase;

    private Competition $competition;

    /** @var list<Team> */
    private array $teams;

    protected function setUp(): void
    {
        parent::setUp();
        $organizer = Sanctum::actingAs(User::factory()->create());
        $this->competition = Competition::create(['owner_id' => $organizer->id, 'name' => 'Coupe', 'status' => 'ongoing']);
        $this->teams = collect(range(1, 7))->map(fn ($i) => $this->teamWithPlayers($organizer->id, "Équipe {$i}"))->all();
        $this->competition->teams()->attach(collect($this->teams)->pluck('id'));
    }

    public function test_letters_continue_after_z(): void
    {
        $this->assertSame(['A', 'B', 'Z', 'AA', 'AB'], array_map(CompetitionGroup::letter(...), [0, 1, 25, 26, 27]));
    }

    public function test_draw_spreads_teams_evenly_into_lettered_groups(): void
    {
        $this->postJson("/api/competitions/{$this->competition->id}/groups/draw", ['count' => 3])->assertNoContent();

        $response = $this->getJson("/api/competitions/{$this->competition->id}")
            ->assertJsonCount(3, 'data.groups')
            ->assertJsonPath('data.groups.0.name', 'Poule A')
            ->assertJsonPath('data.groups.2.name', 'Poule C');

        $sizes = collect($response->json('group_standings'))->map(fn ($g) => count($g['standings']))->sort()->values()->all();
        $this->assertSame([2, 2, 3], $sizes);
        $this->assertTrue(collect($response->json('data.teams'))->every(fn ($t) => $t['group_id'] !== null));
    }

    public function test_draw_rejects_more_groups_than_teams(): void
    {
        $this->postJson("/api/competitions/{$this->competition->id}/groups/draw", ['count' => 8])->assertJsonValidationErrors('count');
    }

    public function test_round_robin_schedule_and_group_standings(): void
    {
        $groupId = $this->postJson("/api/competitions/{$this->competition->id}/groups")->assertCreated()
            ->assertJsonPath('data.name', 'Poule A')->json('data.id');

        foreach (array_slice($this->teams, 0, 3) as $team) {
            $this->putJson("/api/competitions/{$this->competition->id}/teams/{$team->id}/group", ['group_id' => $groupId])->assertNoContent();
        }

        $this->postJson("/api/groups/{$groupId}/schedule")->assertJsonPath('created', 3);
        $this->postJson("/api/groups/{$groupId}/schedule")->assertJsonPath('created', 0);

        $game = $this->competition->games()->first();
        $this->postJson("/api/games/{$game->id}/start", ['uses_buzzer' => false]);
        $this->postJson("/api/games/{$game->id}/events", ['team_id' => $game->team_a_id, 'points' => 40]);
        $this->toSecondHalf($game->id);
        $this->postJson("/api/games/{$game->id}/finish");

        $this->getJson("/api/competitions/{$this->competition->id}")
            ->assertJsonPath('group_standings.0.name', 'Poule A')
            ->assertJsonCount(3, 'group_standings.0.standings')
            ->assertJsonPath('group_standings.0.standings.0.team.id', $game->team_a_id)
            ->assertJsonPath('group_standings.0.standings.0.points', 3)
            ->assertJsonPath('data.games.0.group.name', 'Poule A');
    }

    public function test_a_group_game_needs_both_teams_in_the_group(): void
    {
        $groupId = $this->postJson("/api/competitions/{$this->competition->id}/groups")->json('data.id');
        $this->putJson("/api/competitions/{$this->competition->id}/teams/{$this->teams[0]->id}/group", ['group_id' => $groupId]);

        $this->postJson("/api/competitions/{$this->competition->id}/games", [
            'team_a_id' => $this->teams[0]->id, 'team_b_id' => $this->teams[1]->id, 'group_id' => $groupId,
        ])->assertJsonValidationErrors('group_id');
    }

    public function test_draw_is_locked_once_group_games_started(): void
    {
        $this->postJson("/api/competitions/{$this->competition->id}/groups/draw", ['count' => 2]);
        $groupId = $this->competition->groups()->first()->id;
        $this->postJson("/api/groups/{$groupId}/schedule");
        $this->postJson('/api/games/'.$this->competition->games()->first()->id.'/start', ['uses_buzzer' => false]);

        $this->postJson("/api/competitions/{$this->competition->id}/groups/draw", ['count' => 2])->assertStatus(422);
    }

    public function test_only_the_organizer_manages_groups(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $this->postJson("/api/competitions/{$this->competition->id}/groups")->assertForbidden();
        $this->postJson("/api/competitions/{$this->competition->id}/groups/draw", ['count' => 2])->assertForbidden();
    }
}
