<?php

namespace Tests\Feature;

use App\Models\Competition;
use App\Models\Game;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MatchSheetTest extends TestCase
{
    use RefreshDatabase;

    private User $manager;

    private User $captain;

    private Team $home;

    private Team $away;

    private Game $game;

    protected function setUp(): void
    {
        parent::setUp();
        $this->manager = User::factory()->manager()->create();
        $this->captain = User::factory()->manager()->create();
        $this->home = $this->teamWithPlayers($this->captain->id, 'Gaïndé', 7);
        $this->away = $this->teamWithPlayers($this->manager->id, 'Jambaar', 4);
        $competition = Competition::create(['owner_id' => $this->manager->id, 'name' => 'Coupe', 'status' => 'ongoing']);
        $competition->teams()->attach([$this->home->id, $this->away->id]);
        $this->game = $competition->games()->create(['team_a_id' => $this->home->id, 'team_b_id' => $this->away->id]);
    }

    private function ids(Team $team): array
    {
        return $team->players()->pluck('id')->all();
    }

    private function sheet(array $starters, array $substitutes)
    {
        return $this->putJson("/api/games/{$this->game->id}/lineup", ['team_id' => $this->home->id, 'starters' => $starters, 'substitutes' => $substitutes]);
    }

    public function test_default_sheet_is_four_starters_and_two_substitutes(): void
    {
        $players = $this->getJson("/api/games/{$this->game->id}")->json('data.team_a.players');

        $this->assertCount(6, $players);
        $this->assertSame(['starter', 'starter', 'starter', 'starter', 'substitute', 'substitute'], array_column($players, 'role'));
        $this->assertSame([true, true, true, true, false, false], array_column($players, 'on_field'));
        $this->assertCount(7, $this->getJson("/api/games/{$this->game->id}")->json('data.team_a.roster'));
    }

    public function test_the_team_captain_composes_the_sheet_before_kickoff(): void
    {
        $p = $this->ids($this->home);
        Sanctum::actingAs($this->captain);

        $this->sheet(array_slice($p, 0, 3), [])->assertJsonValidationErrors('starters');
        $this->sheet(array_slice($p, 0, 4), array_slice($p, 4, 3))->assertJsonValidationErrors('substitutes');
        $this->sheet(array_slice($p, 0, 4), [$p[0]])->assertJsonValidationErrors('substitutes.0');
        $this->sheet([$p[0], $p[1], $p[2], $this->ids($this->away)[0]], [])->assertJsonValidationErrors('starters.3');

        // Le capitaine (joueur 1) est obligatoirement titulaire, et toujours placé en première position.
        $this->sheet([$p[6], $p[5], $p[4], $p[3]], [$p[0]])->assertJsonValidationErrors('starters');
        $this->sheet([$p[6], $p[5], $p[0], $p[3]], [$p[4]])
            ->assertOk()
            ->assertJsonCount(5, 'data.team_a.players')
            ->assertJsonPath('data.team_a.players.0.id', $p[0])
            ->assertJsonPath('data.team_a.players.0.is_captain', true)
            ->assertJsonPath('data.team_a.players.1.id', $p[6])
            ->assertJsonPath('data.team_a.players.4.id', $p[4])
            ->assertJsonPath('data.team_a.players.4.role', 'substitute');

        // Le capitaine ne compose pas l'équipe adverse.
        $this->putJson("/api/games/{$this->game->id}/lineup", ['team_id' => $this->away->id, 'starters' => $this->ids($this->away), 'substitutes' => []])->assertForbidden();
    }

    public function test_substitutions_only_at_halftime_and_only_on_field_players_score(): void
    {
        $p = $this->ids($this->home);
        Sanctum::actingAs($this->manager);
        $this->postJson("/api/games/{$this->game->id}/start", ['uses_buzzer' => false])->assertOk()->assertJsonPath('data.phase', 'first_half');

        // La feuille est figée et les remplaçants ne marquent pas.
        $this->sheet(array_slice($p, 0, 4), [])->assertStatus(422);
        $score = fn ($player) => $this->postJson("/api/games/{$this->game->id}/events", ['team_id' => $this->home->id, 'player_id' => $player, 'points' => 10]);
        $score($p[1])->assertOk();
        $score($p[4])->assertStatus(422)->assertJsonPath('message', 'Ce joueur n’est pas sur le terrain.');

        $swap = fn () => $this->postJson("/api/games/{$this->game->id}/substitutions", ['team_id' => $this->home->id, 'player_out_id' => $p[1], 'player_in_id' => $p[4]]);
        $swap()->assertStatus(422)->assertJsonPath('message', 'Les remplacements ne sont possibles que pendant la mi-temps.');
        $this->postJson("/api/games/{$this->game->id}/finish")->assertStatus(422);

        $this->postJson("/api/games/{$this->game->id}/halftime")->assertJsonPath('data.phase', 'halftime');
        $score($p[2])->assertStatus(422);

        // Pendant la mi-temps, le manager de l'équipe fait entrer un remplaçant ; le capitaine ne sort jamais.
        Sanctum::actingAs($this->captain);
        $this->postJson("/api/games/{$this->game->id}/substitutions", ['team_id' => $this->home->id, 'player_out_id' => $p[0], 'player_in_id' => $p[4]])
            ->assertStatus(422)->assertJsonPath('message', 'Le capitaine reste sur le terrain, en première position : il ne peut pas être remplacé.');
        $swap()->assertOk()
            ->assertJsonPath('data.substitutions.0.player_in', 'Gaïndé joueur 5')
            ->assertJsonPath('data.substitutions.0.player_out', 'Gaïndé joueur 2');
        $this->postJson("/api/games/{$this->game->id}/substitutions", ['team_id' => $this->home->id, 'player_out_id' => $p[1], 'player_in_id' => $p[5]])
            ->assertStatus(422)->assertJsonPath('message', 'Le joueur remplacé doit être sur le terrain.');
        $this->postJson("/api/games/{$this->game->id}/substitutions", ['team_id' => $this->home->id, 'player_out_id' => $p[2], 'player_in_id' => $p[6]])
            ->assertStatus(422)->assertJsonPath('message', 'Le joueur entrant doit être sur le banc.');
        $this->postJson("/api/games/{$this->game->id}/second-half")->assertForbidden();

        Sanctum::actingAs($this->manager);
        $this->postJson("/api/games/{$this->game->id}/second-half")->assertJsonPath('data.phase', 'second_half');
        $score($p[4])->assertOk();
        $score($p[1])->assertStatus(422);
        $swap()->assertStatus(422);

        $this->postJson("/api/games/{$this->game->id}/finish")->assertOk()->assertJsonPath('data.team_a.score', 20);
    }

    public function test_two_players_of_the_same_group_can_swap_positions(): void
    {
        $p = $this->ids($this->home);
        Sanctum::actingAs($this->captain);
        $order = fn () => array_column($this->getJson("/api/games/{$this->game->id}")->json('data.team_a.players'), 'id');

        // Avant le match, sur la composition par défaut. Le capitaine (joueur 1) ne quitte pas la première position.
        $this->postJson("/api/games/{$this->game->id}/swap", ['team_id' => $this->home->id, 'player_a_id' => $p[0], 'player_b_id' => $p[3]])
            ->assertStatus(422)->assertJsonPath('message', 'Le capitaine occupe toujours la première position sur le terrain.');
        $this->postJson("/api/games/{$this->game->id}/swap", ['team_id' => $this->home->id, 'player_a_id' => $p[1], 'player_b_id' => $p[3]])->assertOk();
        $this->assertSame([$p[0], $p[3], $p[2], $p[1], $p[4], $p[5]], $order());

        // Un titulaire et un remplaçant ne s'échangent pas : c'est un remplacement.
        $this->postJson("/api/games/{$this->game->id}/swap", ['team_id' => $this->home->id, 'player_a_id' => $p[1], 'player_b_id' => $p[4]])
            ->assertStatus(422);

        // Aucun changement pendant le jeu ; à la mi-temps, échanges et remplacements (l'entrant prend la place du sortant).
        Sanctum::actingAs($this->manager);
        $this->postJson("/api/games/{$this->game->id}/start", ['uses_buzzer' => false])->assertOk();
        $this->postJson("/api/games/{$this->game->id}/swap", ['team_id' => $this->home->id, 'player_a_id' => $p[4], 'player_b_id' => $p[5]])
            ->assertStatus(422)->assertJsonPath('message', 'Aucun changement pendant le jeu : attendez la mi-temps.');
        $this->postJson("/api/games/{$this->game->id}/halftime");
        $this->postJson("/api/games/{$this->game->id}/swap", ['team_id' => $this->home->id, 'player_a_id' => $p[4], 'player_b_id' => $p[5]])->assertOk();
        $this->postJson("/api/games/{$this->game->id}/substitutions", ['team_id' => $this->home->id, 'player_out_id' => $p[3], 'player_in_id' => $p[4]])->assertOk();
        $this->assertSame([$p[0], $p[4], $p[2], $p[1], $p[5], $p[3]], $order());

        // Le capitaine adverse ne touche pas à cette équipe.
        Sanctum::actingAs(User::factory()->create());
        $this->postJson("/api/games/{$this->game->id}/swap", ['team_id' => $this->home->id, 'player_a_id' => $p[0], 'player_b_id' => $p[2]])->assertForbidden();
    }

    public function test_a_team_needs_four_players_to_kick_off(): void
    {
        $short = $this->teamWithPlayers($this->manager->id, 'Incomplète', 3);
        $this->game->update(['team_b_id' => $short->id]);
        Sanctum::actingAs($this->manager);

        $this->postJson("/api/games/{$this->game->id}/start", ['uses_buzzer' => false])->assertStatus(422)
            ->assertJsonPath('message', '« Incomplète » doit aligner 4 joueurs titulaires pour commencer le match.');
    }

    public function test_team_and_quick_team_sizes(): void
    {
        Sanctum::actingAs($this->captain);
        $this->postJson('/api/teams', ['name' => 'Trop courte', 'players' => [['name' => 'a'], ['name' => 'b'], ['name' => 'c']]])->assertJsonValidationErrors('players');

        $seven = array_map(fn ($i) => "J{$i}", range(1, 7));
        $this->postJson('/api/games/friendly', ['team_a' => ['name' => 'A', 'players' => $seven], 'team_b' => ['id' => $this->home->id]])
            ->assertJsonValidationErrors('team_a.players');
        $this->postJson('/api/games/friendly', ['team_a' => ['name' => 'A', 'players' => array_slice($seven, 0, 6)], 'team_b' => ['id' => $this->home->id]])
            ->assertCreated()->assertJsonCount(6, 'data.team_a.players');
    }
}
