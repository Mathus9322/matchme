<?php

namespace Tests\Feature;

use App\Models\Competition;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class TeamStatsTest extends TestCase
{
    use RefreshDatabase;

    public function test_public_team_and_player_stats(): void
    {
        $manager = Sanctum::actingAs(User::factory()->manager()->create());
        $competition = Competition::create(['owner_id' => $manager->id, 'name' => 'Coupe', 'status' => 'ongoing']);
        $rubric = $competition->rubrics()->create(['name' => 'Questions éclair', 'points' => [10, 20], 'penalties' => true]);
        $home = $this->teamWithPlayers($manager->id, 'Gaïndé', 6);
        $away = $this->teamWithPlayers($manager->id, 'Jambaar');
        $competition->teams()->attach([$home->id, $away->id]);
        $p = $home->players()->pluck('id');

        // Match 1 : victoire ; le remplaçant 5 entre à la mi-temps et marque, le 6 reste sur le banc.
        $first = $competition->games()->create(['team_a_id' => $home->id, 'team_b_id' => $away->id, 'round' => 'J1']);
        $this->postJson("/api/games/{$first->id}/start", ['uses_buzzer' => false]);
        $this->postJson("/api/games/{$first->id}/events", ['team_id' => $home->id, 'player_id' => $p[0], 'rubric_id' => $rubric->id, 'points' => 20]);
        $this->postJson("/api/games/{$first->id}/events", ['team_id' => $home->id, 'player_id' => $p[0], 'rubric_id' => $rubric->id, 'points' => -10]);
        $this->postJson("/api/games/{$first->id}/halftime");
        $this->postJson("/api/games/{$first->id}/substitutions", ['team_id' => $home->id, 'player_out_id' => $p[1], 'player_in_id' => $p[4]]);
        $this->postJson("/api/games/{$first->id}/second-half");
        $this->postJson("/api/games/{$first->id}/events", ['team_id' => $home->id, 'player_id' => $p[4], 'rubric_id' => $rubric->id, 'points' => 10]);
        $this->postJson("/api/games/{$first->id}/finish");

        // Match 2 : défaite.
        $second = $competition->games()->create(['team_a_id' => $away->id, 'team_b_id' => $home->id, 'round' => 'J2']);
        $this->postJson("/api/games/{$second->id}/start", ['uses_buzzer' => false]);
        $this->postJson("/api/games/{$second->id}/events", ['team_id' => $away->id, 'rubric_id' => $rubric->id, 'points' => 20]);
        $this->toSecondHalf($second->id);
        $this->postJson("/api/games/{$second->id}/finish");

        $this->app['auth']->forgetGuards();
        $stats = $this->getJson("/api/teams/{$home->id}/stats")->assertOk()
            ->assertJsonPath('data.team.name', 'Gaïndé')
            ->assertJsonPath('data.record.played', 2)
            ->assertJsonPath('data.record.won', 1)
            ->assertJsonPath('data.record.lost', 1)
            ->assertJsonPath('data.record.points_for', 20)
            ->assertJsonPath('data.record.points_against', 20)
            ->assertJsonPath('data.record.win_rate', 50)
            ->assertJsonPath('data.form', ['D', 'V'])
            ->assertJsonPath('data.top_scorer.id', $p[0])
            ->assertJsonCount(2, 'data.recent')
            ->json('data.players');

        $byId = collect($stats)->keyBy('id');
        $this->assertSame([2, 10, 1, 1], [$byId[$p[0]]['appearances'], $byId[$p[0]]['points'], $byId[$p[0]]['answers'], $byId[$p[0]]['penalties']]);
        $this->assertSame(1, $byId[$p[4]]['appearances'], 'Le remplaçant entré en jeu a joué un match.');
        $this->assertSame(0, $byId[$p[5]]['appearances'], 'Le remplaçant resté sur le banc n’a pas joué.');

        $this->getJson("/api/players/{$p[0]}/stats")->assertOk()
            ->assertJsonPath('data.team.name', 'Gaïndé')
            ->assertJsonPath('data.average', 5)
            ->assertJsonPath('data.best.opponent', 'Jambaar')
            ->assertJsonPath('data.rubrics.0.name', 'Questions éclair')
            ->assertJsonPath('data.rubrics.0.points', 10)
            ->assertJsonCount(2, 'data.matches')
            ->assertJsonPath('data.matches.0.result', 'D')
            ->assertJsonPath('data.matches.1.points', 10);

        $this->getJson("/api/players/{$p[5]}/stats")->assertJsonCount(0, 'data.matches');

        // Match amical entre les mêmes équipes : stats et face-à-face importés.
        Sanctum::actingAs($manager);
        $friendly = $this->postJson('/api/games/friendly', ['team_a' => ['id' => $home->id], 'team_b' => ['id' => $away->id]])->json('data.id');
        $this->app['auth']->forgetGuards();
        $this->getJson("/api/games/{$friendly}/matchup")->assertOk()
            ->assertJsonPath('data.team_a.name', 'Gaïndé')
            ->assertJsonPath('data.team_a.record.played', 2)
            ->assertJsonPath('data.team_a.record.friendlies', 0)
            ->assertJsonPath('data.team_a.form', ['D', 'V'])
            ->assertJsonPath('data.team_a.players.0.id', $p[0])
            ->assertJsonPath('data.team_b.record.won', 1)
            ->assertJsonPath('data.head_to_head.played', 2)
            ->assertJsonPath('data.head_to_head.wins_a', 1)
            ->assertJsonPath('data.head_to_head.wins_b', 1)
            ->assertJsonPath('data.head_to_head.draws', 0)
            ->assertJsonCount(2, 'data.head_to_head.meetings');
    }
}
