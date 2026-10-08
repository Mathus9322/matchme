<?php

namespace Tests\Feature;

use App\Models\Competition;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CompetitionLifecycleTest extends TestCase
{
    use RefreshDatabase;

    private Competition $competition;

    protected function setUp(): void
    {
        parent::setUp();
        $manager = Sanctum::actingAs(User::factory()->manager()->create());
        $this->competition = Competition::create(['owner_id' => $manager->id, 'name' => 'Coupe', 'status' => 'open']);
    }

    private function registerTeams(): array
    {
        $teams = collect(['Gaïndé', 'Jambaar'])->map(fn ($name) => $this->teamWithPlayers($this->competition->owner_id, $name));
        $this->competition->teams()->attach($teams->pluck('id'));

        return $teams->all();
    }

    private function url(string $action): string
    {
        return "/api/competitions/{$this->competition->id}/{$action}";
    }

    public function test_publishing_requires_two_teams_and_sets_the_start_date(): void
    {
        $this->postJson($this->url('publish'))->assertStatus(422)->assertJsonPath('message', 'Inscrivez au moins deux équipes avant de publier la compétition.');

        $this->registerTeams();
        $this->postJson($this->url('publish'))
            ->assertOk()
            ->assertJsonPath('data.status', 'ongoing')
            ->assertJsonPath('data.starts_on', now()->toDateString());

        $this->postJson($this->url('publish'))->assertStatus(422);
    }

    public function test_finishing_is_blocked_while_a_game_is_live_and_locks_the_games(): void
    {
        [$a, $b] = $this->registerTeams();
        $this->postJson($this->url('finish'))->assertStatus(422);
        $this->postJson($this->url('publish'))->assertOk();

        $game = $this->competition->games()->create(['team_a_id' => $a->id, 'team_b_id' => $b->id]);
        $scheduled = $this->competition->games()->create(['team_a_id' => $b->id, 'team_b_id' => $a->id]);
        $this->postJson("/api/games/{$game->id}/start")->assertOk();

        $this->postJson($this->url('finish'))->assertStatus(422)->assertJsonPath('message', fn ($m) => str_contains($m, 'en direct'));

        $this->toSecondHalf($game->id);
        $this->postJson("/api/games/{$game->id}/finish")->assertOk();
        $this->postJson($this->url('finish'))
            ->assertOk()
            ->assertJsonPath('data.status', 'finished')
            ->assertJsonPath('data.ends_on', now()->toDateString());

        // Plus aucun match ne peut être démarré ou créé.
        $this->postJson("/api/games/{$scheduled->id}/start")->assertStatus(422);
        $this->postJson("/api/competitions/{$this->competition->id}/games", ['team_a_id' => $a->id, 'team_b_id' => $b->id])->assertStatus(422);

        // Réouverture possible en cas d'erreur.
        $this->postJson($this->url('reopen'))->assertOk()->assertJsonPath('data.status', 'ongoing');
        $this->postJson("/api/games/{$scheduled->id}/start")->assertOk();
    }

    public function test_only_the_organizer_changes_the_lifecycle(): void
    {
        $this->registerTeams();
        Sanctum::actingAs(User::factory()->manager()->create());

        $this->postJson($this->url('publish'))->assertForbidden();
        $this->postJson($this->url('finish'))->assertForbidden();
    }
}
