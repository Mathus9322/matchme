<?php

namespace Tests\Feature;

use App\Models\Competition;
use App\Models\Game;
use App\Models\RubricPreset;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RubricScoringTest extends TestCase
{
    use RefreshDatabase;

    private Competition $competition;

    private Game $game;

    protected function setUp(): void
    {
        parent::setUp();
        $manager = Sanctum::actingAs(User::factory()->manager()->create());
        $this->competition = Competition::create(['owner_id' => $manager->id, 'name' => 'Coupe', 'status' => 'ongoing']);
        $a = Team::create(['owner_id' => $manager->id, 'name' => 'Gaïndé']);
        $b = Team::create(['owner_id' => $manager->id, 'name' => 'Jambaar']);
        $this->competition->teams()->attach([$a->id, $b->id]);
        $this->game = $this->competition->games()->create(['team_a_id' => $a->id, 'team_b_id' => $b->id, 'status' => 'live']);
    }

    public function test_presets_are_available_publicly(): void
    {
        $this->assertGreaterThan(5, RubricPreset::count());
        $this->getJson('/api/rubric-presets')->assertOk()->assertJsonPath('data.0.name', 'Questions éclair');
    }

    public function test_default_scale_applies_without_rubrics(): void
    {
        $url = "/api/games/{$this->game->id}/events";
        $this->postJson($url, ['team_id' => $this->game->team_a_id, 'points' => 40])->assertOk();
        $this->postJson($url, ['team_id' => $this->game->team_a_id, 'points' => -20])->assertOk();
        $this->postJson($url, ['team_id' => $this->game->team_a_id, 'points' => 15])->assertJsonValidationErrors('points');
    }

    public function test_scoring_with_a_null_rubric_as_sent_by_the_interface(): void
    {
        // Sans rubriques : rubric_id null est accepté (c'est ce qu'envoie l'interface).
        $url = "/api/games/{$this->game->id}/events";
        $this->postJson($url, ['team_id' => $this->game->team_a_id, 'player_id' => null, 'rubric_id' => null, 'points' => 10])
            ->assertOk()->assertJsonPath('data.team_a.score', 10);
        $this->postJson($url, ['team_id' => $this->game->team_a_id, 'rubric_id' => 5, 'points' => 10])->assertJsonValidationErrors('rubric_id');

        // Avec des rubriques : null est refusé, il faut choisir la rubrique.
        $this->competition->rubrics()->create(['name' => 'Questions éclair', 'points' => [10], 'penalties' => true]);
        $this->postJson($url, ['team_id' => $this->game->team_a_id, 'rubric_id' => null, 'points' => 10])->assertJsonValidationErrors('rubric_id');
    }

    public function test_custom_default_scale(): void
    {
        $this->putJson("/api/competitions/{$this->competition->id}/scoring", ['points' => [5, 15], 'penalties' => false])
            ->assertJsonPath('data.points', [5, 15]);

        $url = "/api/games/{$this->game->id}/events";
        $this->postJson($url, ['team_id' => $this->game->team_a_id, 'points' => 15])->assertOk();
        $this->postJson($url, ['team_id' => $this->game->team_a_id, 'points' => -5])->assertJsonValidationErrors('points');
        $this->getJson("/api/games/{$this->game->id}")->assertJsonPath('data.scoring.points', [5, 15]);
    }

    public function test_rubrics_drive_scoring_and_breakdown(): void
    {
        $flash = $this->postJson("/api/competitions/{$this->competition->id}/rubrics", [
            'name' => 'Questions éclair', 'description' => 'Buzzer, réponses rapides.', 'points' => [10], 'penalties' => true,
        ])->assertCreated()->json('data.id');

        $this->postJson('/api/competitions/'.$this->competition->id.'/rubrics/presets', [
            'preset_ids' => RubricPreset::whereIn('name', ['Le relais', 'Sport'])->pluck('id'),
        ])->assertJsonPath('created', 2);

        $relay = $this->competition->rubrics()->where('name', 'Le relais')->value('id');
        $url = "/api/games/{$this->game->id}/events";

        // La rubrique devient obligatoire et son barème s'applique.
        $this->postJson($url, ['team_id' => $this->game->team_a_id, 'points' => 10])->assertJsonValidationErrors('rubric_id');
        $this->postJson($url, ['team_id' => $this->game->team_a_id, 'rubric_id' => $flash, 'points' => 20])->assertJsonValidationErrors('points');
        $this->postJson($url, ['team_id' => $this->game->team_a_id, 'rubric_id' => $relay, 'points' => -30])->assertJsonValidationErrors('points');

        $this->postJson($url, ['team_id' => $this->game->team_a_id, 'rubric_id' => $flash, 'points' => -10])->assertOk();
        $this->postJson($url, ['team_id' => $this->game->team_a_id, 'rubric_id' => $relay, 'points' => 30])
            ->assertJsonPath('data.team_a.score', 20)
            ->assertJsonPath("data.team_a.rubric_scores.{$flash}", -10)
            ->assertJsonPath("data.team_a.rubric_scores.{$relay}", 30)
            ->assertJsonPath('data.events.0.rubric', 'Le relais')
            ->assertJsonCount(3, 'data.rubrics');
    }

    public function test_rubrics_can_be_reordered_edited_and_deleted(): void
    {
        $ids = collect(['Un', 'Deux', 'Trois'])->map(fn ($name) => $this->postJson("/api/competitions/{$this->competition->id}/rubrics", [
            'name' => $name, 'points' => [10], 'penalties' => false,
        ])->json('data.id'));

        $this->postJson("/api/rubrics/{$ids[2]}/move", ['direction' => 'up'])->assertNoContent();
        $this->getJson("/api/competitions/{$this->competition->id}")
            ->assertJsonPath('data.rubrics.1.name', 'Trois')
            ->assertJsonPath('data.rubrics.2.name', 'Deux');

        $this->putJson("/api/rubrics/{$ids[0]}", ['name' => 'Premier', 'description' => 'Nouvelle description', 'points' => [20, 40], 'penalties' => true])
            ->assertJsonPath('data.description', 'Nouvelle description');

        $this->deleteJson("/api/rubrics/{$ids[1]}")->assertNoContent();
        $this->assertSame(2, $this->competition->rubrics()->count());
    }

    public function test_only_the_organizer_edits_rubrics(): void
    {
        Sanctum::actingAs(User::factory()->manager()->create());
        $this->postJson("/api/competitions/{$this->competition->id}/rubrics", ['name' => 'X', 'points' => [10], 'penalties' => true])->assertForbidden();
        $this->putJson("/api/competitions/{$this->competition->id}/scoring", ['points' => [10], 'penalties' => true])->assertForbidden();
    }

    public function test_only_the_match_manager_advances_rubrics_and_only_during_play(): void
    {
        $first = $this->competition->rubrics()->create(['name' => 'Éclair', 'points' => [10], 'penalties' => true, 'position' => 0]);
        $second = $this->competition->rubrics()->create(['name' => 'Tiroirs', 'points' => [20], 'penalties' => false, 'position' => 1]);
        $url = "/api/games/{$this->game->id}/rubric";

        // Par défaut, la première rubrique du programme.
        $this->getJson("/api/games/{$this->game->id}")->assertJsonPath('data.current_rubric_id', $first->id);
        $this->game->update(['phase' => Game::PHASE_FIRST_HALF]);
        $this->postJson($url, ['rubric_id' => $second->id])->assertOk()->assertJsonPath('data.current_rubric_id', $second->id);

        // À la mi-temps ou avant le match, les rubriques n'avancent pas.
        $this->game->update(['phase' => Game::PHASE_HALFTIME]);
        $this->postJson($url, ['rubric_id' => $first->id])->assertStatus(422);
        $this->game->update(['status' => Game::STATUS_SCHEDULED, 'phase' => null]);
        $this->postJson($url, ['rubric_id' => $first->id])->assertStatus(422);

        // Le coach d'une équipe ne fait que voir les rubriques.
        $this->game->update(['status' => Game::STATUS_LIVE, 'phase' => Game::PHASE_SECOND_HALF]);
        $coach = User::factory()->create();
        $this->game->teamA->update(['coach_id' => $coach->id]);
        Sanctum::actingAs($coach);
        $this->postJson($url, ['rubric_id' => $first->id])->assertForbidden();
        $this->getJson("/api/games/{$this->game->id}")->assertJsonPath('data.current_rubric_id', $second->id);
    }
}
