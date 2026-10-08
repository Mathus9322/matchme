<?php

namespace Tests\Feature;

use App\Models\Competition;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class WatchCodeTest extends TestCase
{
    use RefreshDatabase;

    public function test_spectators_open_a_match_with_its_code(): void
    {
        $manager = User::factory()->manager()->create();
        $a = $this->teamWithPlayers($manager->id, 'Lynx');
        $b = $this->teamWithPlayers($manager->id, 'Comètes');
        $game = Competition::create(['owner_id' => $manager->id, 'name' => 'Coupe', 'status' => 'ongoing'])
            ->games()->create(['team_a_id' => $a->id, 'team_b_id' => $b->id]);

        $this->assertMatchesRegularExpression('/^[A-HJKMNP-Z2-9]{5}$/', $game->watch_code);
        $this->getJson("/api/games/{$game->id}")->assertJsonPath('data.watch_code', $game->watch_code);

        // Sans compte, en minuscules ou avec un tiret : le code est reconnu.
        $typed = strtolower(substr($game->watch_code, 0, 2)).'-'.substr($game->watch_code, 2);
        $this->getJson("/api/watch/{$typed}")->assertOk()->assertJsonPath('data.id', $game->id);
        $this->getJson('/api/watch/ZZZZ9')->assertNotFound();
    }
}
