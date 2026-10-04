<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MatchApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_creates_and_returns_a_match(): void
    {
        $match = [
            'team_a' => ['name' => 'Les Rouges', 'players' => ['Alice', 'Bob', 'Chloé', 'David']],
            'team_b' => ['name' => 'Les Bleus', 'players' => ['Emma', 'Farid', 'Gaël', 'Hana']],
        ];

        $response = $this->postJson('/api/matches', $match)
            ->assertCreated()
            ->assertJsonPath('data.team_a.name', 'Les Rouges')
            ->assertJsonPath('data.team_b.players.3', 'Hana');

        $this->getJson('/api/matches/'.$response->json('data.id'))
            ->assertOk()
            ->assertJsonPath('data.team_a.players.0', 'Alice');
    }

    public function test_it_requires_four_named_players_per_team(): void
    {
        $this->postJson('/api/matches', [
            'team_a' => ['name' => 'Les Rouges', 'players' => ['Alice', 'Bob']],
            'team_b' => ['name' => 'Les Bleus', 'players' => ['Emma', 'Farid', 'Gaël', 'Hana']],
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('team_a.players');
    }
}