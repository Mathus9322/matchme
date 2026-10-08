<?php

namespace Tests\Feature;

use App\Models\Competition;
use App\Models\ResultSheet;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ResultSheetTest extends TestCase
{
    use RefreshDatabase;

    public function test_finishing_a_match_files_its_score_sheet_in_the_results_folder(): void
    {
        $manager = Sanctum::actingAs(User::factory()->manager()->create(['name' => 'Awa Diop']));
        $competition = Competition::create(['owner_id' => $manager->id, 'name' => 'Coupe de Thiès', 'status' => 'ongoing']);
        $rubric = $competition->rubrics()->create(['name' => 'Questions éclair', 'points' => [10], 'penalties' => true]);
        $home = $this->teamWithPlayers($manager->id, 'Gaïndé', 6);
        $away = $this->teamWithPlayers($manager->id, 'Jambaar');
        $competition->teams()->attach([$home->id, $away->id]);
        $game = $competition->games()->create(['team_a_id' => $home->id, 'team_b_id' => $away->id, 'round' => 'Finale']);
        $p = $home->players()->pluck('id');

        $this->postJson("/api/games/{$game->id}/start");
        $this->postJson("/api/games/{$game->id}/events", ['team_id' => $home->id, 'player_id' => $p[0], 'rubric_id' => $rubric->id, 'points' => 10]);
        $this->toSecondHalf($game->id);
        $this->assertSame(0, ResultSheet::count());

        $id = $this->postJson("/api/games/{$game->id}/finish")->assertOk()->json('data.result_sheet_id');
        $this->assertNotNull($id);

        $this->getJson("/api/competitions/{$competition->id}/result-sheets")
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.title', 'Gaïndé – Jambaar')
            ->assertJsonPath('data.0.score', '10 – 0');

        $this->app['auth']->forgetGuards();
        $this->getJson("/api/result-sheets/{$id}")
            ->assertOk()
            ->assertJsonPath('data.competition', 'Coupe de Thiès')
            ->assertJsonPath('data.round', 'Finale')
            ->assertJsonPath('data.manager', 'Awa Diop')
            ->assertJsonPath('data.winner', 'a')
            ->assertJsonPath('data.rubrics', ['Questions éclair'])
            ->assertJsonPath('data.team_a.rubrics', [10])
            ->assertJsonCount(6, 'data.team_a.players')
            ->assertJsonPath('data.team_a.players.0.score', 10)
            ->assertJsonPath('data.team_a.players.4.role', 'substitute')
            ->assertJsonPath('data.events.0.rubric', 'Questions éclair');
    }

    public function test_a_reopened_match_updates_its_sheet_and_friendlies_have_none(): void
    {
        $manager = Sanctum::actingAs(User::factory()->manager()->create());
        $competition = Competition::create(['owner_id' => $manager->id, 'name' => 'Coupe', 'status' => 'ongoing']);
        $a = $this->teamWithPlayers($manager->id, 'A');
        $b = $this->teamWithPlayers($manager->id, 'B');
        $competition->teams()->attach([$a->id, $b->id]);
        $game = $competition->games()->create(['team_a_id' => $a->id, 'team_b_id' => $b->id]);

        $this->postJson("/api/games/{$game->id}/start");
        $this->toSecondHalf($game->id);
        $this->postJson("/api/games/{$game->id}/finish");
        $this->postJson("/api/games/{$game->id}/start")->assertJsonPath('data.phase', 'second_half');
        $this->postJson("/api/games/{$game->id}/events", ['team_id' => $b->id, 'points' => 20]);
        $this->postJson("/api/games/{$game->id}/finish");

        $this->assertSame(1, ResultSheet::count());
        $this->assertSame('b', ResultSheet::first()->data['winner']);

        $friendly = $this->postJson('/api/games/friendly', [
            'team_a' => ['id' => $a->id], 'team_b' => ['id' => $b->id], 'start' => true,
        ])->json('data.id');
        $this->toSecondHalf($friendly);
        $this->postJson("/api/games/{$friendly}/finish")->assertJsonPath('data.result_sheet_id', null);
        $this->assertSame(1, ResultSheet::count());
    }
}
