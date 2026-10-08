<?php

namespace Tests;

use App\Models\Team;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    /** Équipe avec un effectif suffisant pour jouer (4 titulaires par défaut). */
    protected function teamWithPlayers(int $ownerId, string $name, int $players = 4): Team
    {
        $team = Team::create(['owner_id' => $ownerId, 'name' => $name]);
        foreach (range(1, $players) as $i) {
            $team->players()->create(['name' => "{$name} joueur {$i}", 'position' => $i - 1]);
        }

        return $team;
    }

    /** Siffle la mi-temps puis relance la seconde mi-temps. */
    protected function toSecondHalf(int $gameId): void
    {
        $this->postJson("/api/games/{$gameId}/halftime")->assertOk();
        $this->postJson("/api/games/{$gameId}/second-half")->assertOk();
    }
}
