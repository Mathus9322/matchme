<?php

namespace Tests\Feature;

use App\Http\Controllers\LeagueController;
use App\Models\Competition;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class LeagueTest extends TestCase
{
    use RefreshDatabase;

    private Competition $competition;

    protected function setUp(): void
    {
        parent::setUp();
        $manager = Sanctum::actingAs(User::factory()->manager()->create());
        $this->competition = Competition::create(['owner_id' => $manager->id, 'name' => 'Championnat', 'status' => 'ongoing', 'format' => 'league']);
    }

    private function register(int $count): void
    {
        $owner = $this->competition->owner_id;
        foreach (range(1, $count) as $i) {
            $this->competition->teams()->attach(Team::create(['owner_id' => $owner, 'name' => "Équipe {$i}"])->id);
        }
    }

    public function test_round_robin_pairs_everyone_once_per_round(): void
    {
        foreach ([4, 5, 6, 7] as $n) {
            $rounds = LeagueController::roundRobin(range(1, $n));
            $this->assertCount($n % 2 ? $n : $n - 1, $rounds);

            $pairs = collect($rounds)->flatten(1)->map(fn ($p) => min($p).'-'.max($p));
            $this->assertCount($n * ($n - 1) / 2, $pairs);
            $this->assertCount($pairs->count(), $pairs->unique(), "Doublon avec {$n} équipes");

            foreach ($rounds as $round) {
                $teams = collect($round)->flatten();
                $this->assertSame($teams->count(), $teams->unique()->count(), 'Une équipe joue deux fois la même journée');
            }
        }
    }

    public function test_generates_a_home_and_away_calendar(): void
    {
        $this->register(4);

        $this->postJson("/api/competitions/{$this->competition->id}/league/schedule", [
            'double' => true, 'start_at' => '2026-11-01 15:00:00', 'interval_days' => 7,
        ])->assertOk()->assertJsonPath('created', 12)->assertJsonPath('rounds', 6);

        $last = $this->competition->games()->where('round', 'Journée 6')->first();
        $this->assertSame('2026-12-06 15:00', $last->scheduled_at->format('Y-m-d H:i'));
        $this->assertSame('league', $this->getJson("/api/competitions/{$this->competition->id}")->json('data.format'));
    }

    public function test_regeneration_requires_replace_and_no_started_game(): void
    {
        $this->register(3);
        $url = "/api/competitions/{$this->competition->id}/league/schedule";

        $this->postJson($url)->assertJsonPath('created', 3);
        $this->postJson($url)->assertStatus(422);
        $this->postJson($url, ['replace' => true])->assertJsonPath('created', 3);

        $this->competition->games()->first()->update(['status' => 'live']);
        $this->postJson($url, ['replace' => true])->assertStatus(422);
    }

    public function test_league_competitions_have_no_group_draw(): void
    {
        $this->register(4);
        $this->postJson("/api/competitions/{$this->competition->id}/groups/draw", ['count' => 2])->assertStatus(422);
    }

    public function test_group_competitions_cannot_generate_a_league_calendar(): void
    {
        $this->competition->update(['format' => 'groups']);
        $this->register(4);
        $this->postJson("/api/competitions/{$this->competition->id}/league/schedule")->assertStatus(422);
    }
}
