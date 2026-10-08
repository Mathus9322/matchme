<?php

namespace Tests\Feature;

use App\Models\Competition;
use App\Models\Game;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BuzzerTest extends TestCase
{
    use RefreshDatabase;

    private User $referee;

    private Team $home;

    private Team $away;

    private Game $game;

    protected function setUp(): void
    {
        parent::setUp();
        $this->referee = User::factory()->manager()->create();
        $this->home = $this->teamWithPlayers($this->referee->id, 'Lynx', 6);
        $this->away = $this->teamWithPlayers($this->referee->id, 'Comètes', 4);
        $competition = Competition::create(['owner_id' => $this->referee->id, 'name' => 'Coupe', 'status' => 'ongoing']);
        $competition->teams()->attach([$this->home->id, $this->away->id]);
        $this->game = $competition->games()->create(['team_a_id' => $this->home->id, 'team_b_id' => $this->away->id]);
    }

    private function code(): string
    {
        Sanctum::actingAs($this->referee);
        $this->putJson("/api/games/{$this->game->id}/buzzer/mode", ['uses_buzzer' => true])->assertOk();

        return $this->getJson("/api/games/{$this->game->id}/buzzer")->assertOk()->json('data.code');
    }

    /** Relie le téléphone d'un joueur et renvoie son jeton. */
    private function phone(string $code, int $playerId): string
    {
        return $this->postJson('/api/buzzer/claim', ['code' => $code, 'player_id' => $playerId])->assertCreated()->json('token');
    }

    private function buzz(string $token)
    {
        return $this->postJson('/api/buzzer/buzz', [], ['X-Buzzer-Token' => $token]);
    }

    public function test_only_the_referee_sees_the_buzzer_code(): void
    {
        $this->getJson("/api/games/{$this->game->id}/buzzer")->assertUnauthorized();
        Sanctum::actingAs(User::factory()->create());
        $this->getJson("/api/games/{$this->game->id}/buzzer")->assertForbidden();

        // Le coach d'une équipe ne voit pas le buzzer non plus.
        $coach = User::factory()->create();
        $this->home->update(['coach_id' => $coach->id]);
        Sanctum::actingAs($coach);
        $this->getJson("/api/games/{$this->game->id}/buzzer")->assertForbidden();

        $code = $this->code();
        $this->assertMatchesRegularExpression('/^\d{6}$/', $code);
        $this->getJson("/api/games/{$this->game->id}")->assertJsonMissingPath('data.buzzer_code');
    }

    public function test_players_join_with_the_code_and_claim_their_name_once(): void
    {
        $code = $this->code();
        $this->postJson('/api/buzzer/join', ['code' => '000000'])->assertNotFound();
        $this->postJson('/api/buzzer/join', ['code' => $code])
            ->assertOk()
            ->assertJsonCount(6, 'data.teams.0.players')
            ->assertJsonPath('data.teams.0.players.0.taken', false);

        $player = $this->home->players[0]->id;
        $token = $this->phone($code, $player);
        $this->postJson('/api/buzzer/claim', ['code' => $code, 'player_id' => $player])->assertStatus(409);
        $this->postJson('/api/buzzer/claim', ['code' => $code, 'player_id' => User::factory()->create()->id + 999])->assertStatus(422);
        $this->getJson('/api/buzzer/state', ['X-Buzzer-Token' => $token])
            ->assertOk()->assertJsonPath('data.me.player_id', $player)->assertJsonPath('data.status', 'closed');
        $this->getJson('/api/buzzer/state', ['X-Buzzer-Token' => 'faux'])->assertUnauthorized();

        // L'arbitre libère le nom : le téléphone est déconnecté et le nom redevient disponible.
        Sanctum::actingAs($this->referee);
        $this->deleteJson("/api/games/{$this->game->id}/buzzer/devices/{$player}")->assertOk();
        $this->getJson('/api/buzzer/state', ['X-Buzzer-Token' => $token])->assertUnauthorized();
        $this->phone($code, $player);
    }

    public function test_first_buzz_wins_and_a_wrong_answer_passes_the_hand_to_the_other_team(): void
    {
        $code = $this->code();
        $homeA = $this->phone($code, $this->home->players[1]->id);
        $homeB = $this->phone($code, $this->home->players[2]->id);
        $bench = $this->phone($code, $this->home->players[4]->id);
        $away = $this->phone($code, $this->away->players[0]->id);

        // Avant le coup d'envoi : on ne peut pas ouvrir les buzzers.
        Sanctum::actingAs($this->referee);
        $this->postJson("/api/games/{$this->game->id}/buzzer/open")->assertStatus(422);
        $this->postJson("/api/games/{$this->game->id}/start", ['uses_buzzer' => true])->assertOk();
        $this->buzz($homeA)->assertJsonPath('won', false);

        $this->postJson("/api/games/{$this->game->id}/buzzer/open")->assertJsonPath('data.status', 'open');
        $this->buzz($bench)->assertJsonPath('won', false); // remplaçant sur le banc
        $this->buzz($homeA)->assertJsonPath('won', true)->assertJsonPath('data.winner.name', 'Lynx joueur 2');
        $this->buzz($away)->assertJsonPath('won', false)->assertJsonPath('data.status', 'locked');

        // Mauvaise réponse : la main passe aux Comètes, les Lynx sont exclus.
        Sanctum::actingAs($this->referee);
        $this->postJson("/api/games/{$this->game->id}/buzzer/judge", ['result' => 'wrong'])
            ->assertJsonPath('data.status', 'open')->assertJsonPath('data.excluded_team_id', $this->home->id);
        $this->buzz($homeB)->assertJsonPath('won', false);
        $this->buzz($away)->assertJsonPath('won', true);

        Sanctum::actingAs($this->referee);
        $this->postJson("/api/games/{$this->game->id}/buzzer/judge", ['result' => 'correct'])
            ->assertJsonPath('data.status', 'closed')->assertJsonPath('data.last.result', 'correct');
        $this->postJson("/api/games/{$this->game->id}/buzzer/judge", ['result' => 'correct'])->assertStatus(422);

        // Nouvelle manche, puis mi-temps : le buzzer se ferme automatiquement.
        $this->postJson("/api/games/{$this->game->id}/buzzer/open")->assertJsonPath('data.round', 2);
        $this->postJson("/api/games/{$this->game->id}/halftime")->assertOk();
        $this->getJson("/api/games/{$this->game->id}/buzzer")->assertJsonPath('data.status', 'closed');
        $this->buzz($homeA)->assertJsonPath('won', false);
    }

    public function test_both_teams_wrong_closes_the_round_and_a_new_code_disconnects_phones(): void
    {
        $code = $this->code();
        $home = $this->phone($code, $this->home->players[0]->id);
        $away = $this->phone($code, $this->away->players[0]->id);
        Sanctum::actingAs($this->referee);
        $this->postJson("/api/games/{$this->game->id}/start", ['uses_buzzer' => true]);
        $this->postJson("/api/games/{$this->game->id}/buzzer/open");
        $this->buzz($home);
        Sanctum::actingAs($this->referee);
        $this->postJson("/api/games/{$this->game->id}/buzzer/judge", ['result' => 'wrong']);
        $this->buzz($away)->assertJsonPath('won', true);
        Sanctum::actingAs($this->referee);
        $this->postJson("/api/games/{$this->game->id}/buzzer/judge", ['result' => 'wrong'])->assertJsonPath('data.status', 'closed');

        $newCode = $this->postJson("/api/games/{$this->game->id}/buzzer/code")->json('data.code');
        $this->assertNotSame($code, $newCode);
        $this->getJson('/api/buzzer/state', ['X-Buzzer-Token' => $home])->assertUnauthorized();
    }

    public function test_the_buzzer_mode_is_chosen_before_kickoff(): void
    {
        Sanctum::actingAs($this->referee);
        $code = $this->getJson("/api/games/{$this->game->id}/buzzer")->assertJsonPath('data.uses_buzzer', false)->json('data.code');

        // Sans buzzer : les joueurs ne peuvent pas rejoindre et les buzzers ne s'ouvrent pas.
        $this->postJson('/api/buzzer/join', ['code' => $code])->assertNotFound();
        $this->postJson("/api/games/{$this->game->id}/start", ['uses_buzzer' => false])->assertOk();
        $this->postJson("/api/games/{$this->game->id}/buzzer/open")->assertStatus(422);
        $this->putJson("/api/games/{$this->game->id}/buzzer/mode", ['uses_buzzer' => true])->assertStatus(422);
        $this->getJson("/api/games/{$this->game->id}")->assertJsonPath('data.uses_buzzer', false);
    }

    public function test_a_player_who_passes_hands_over_without_points(): void
    {
        $code = $this->code();
        $home = $this->phone($code, $this->home->players[0]->id);
        $away = $this->phone($code, $this->away->players[0]->id);
        Sanctum::actingAs($this->referee);
        $this->postJson("/api/games/{$this->game->id}/start", ['uses_buzzer' => true]);
        $this->postJson("/api/games/{$this->game->id}/buzzer/open");
        $this->buzz($home)->assertJsonPath('won', true);

        Sanctum::actingAs($this->referee);
        $this->postJson("/api/games/{$this->game->id}/buzzer/judge", ['result' => 'passed'])
            ->assertJsonPath('data.status', 'open')
            ->assertJsonPath('data.excluded_team_id', $this->home->id)
            ->assertJsonPath('data.last.result', 'passed');
        $this->buzz($away)->assertJsonPath('won', true);
        $this->getJson("/api/games/{$this->game->id}")->assertJsonPath('data.team_a.score', 0);
    }

    public function test_the_buzzer_choice_is_required_to_start_or_reopen_a_match(): void
    {
        Sanctum::actingAs($this->referee);
        $url = "/api/games/{$this->game->id}";
        $this->postJson("{$url}/start")->assertJsonValidationErrors('uses_buzzer');
        $this->getJson($url)->assertJsonPath('data.status', 'scheduled');

        $this->postJson("{$url}/start", ['uses_buzzer' => true])->assertOk()->assertJsonPath('data.uses_buzzer', true);
        $this->postJson("{$url}/halftime");
        $this->postJson("{$url}/second-half");
        $this->postJson("{$url}/finish")->assertOk();

        // Réouverture : le choix est redemandé.
        $this->postJson("{$url}/start")->assertJsonValidationErrors('uses_buzzer');
        $this->postJson("{$url}/start", ['uses_buzzer' => false])->assertOk()->assertJsonPath('data.uses_buzzer', false);

        // Match amical démarré tout de suite : même obligation.
        $this->postJson('/api/games/friendly', [
            'team_a' => ['id' => $this->home->id], 'team_b' => ['id' => $this->away->id], 'start' => true,
        ])->assertJsonValidationErrors('uses_buzzer');
        $this->postJson('/api/games/friendly', [
            'team_a' => ['id' => $this->home->id], 'team_b' => ['id' => $this->away->id], 'start' => true, 'uses_buzzer' => true,
        ])->assertCreated()->assertJsonPath('data.uses_buzzer', true);
    }
}
