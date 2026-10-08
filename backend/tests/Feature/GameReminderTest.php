<?php

namespace Tests\Feature;

use App\Models\Competition;
use App\Models\Game;
use App\Models\Team;
use App\Models\User;
use App\Notifications\GameStartingSoon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class GameReminderTest extends TestCase
{
    use RefreshDatabase;

    private User $captainA;

    private User $captainB;

    private Competition $competition;

    private Team $teamA;

    private Team $teamB;

    protected function setUp(): void
    {
        parent::setUp();
        $this->captainA = User::factory()->create();
        $this->captainB = User::factory()->create();
        $this->teamA = Team::create(['owner_id' => $this->captainA->id, 'name' => 'Gaïndé de Thiès']);
        $this->teamB = Team::create(['owner_id' => $this->captainB->id, 'name' => 'Jambaar de Dakar']);
        $this->competition = Competition::create(['owner_id' => User::factory()->manager()->create()->id, 'name' => 'Coupe', 'status' => 'ongoing']);
        $this->competition->teams()->attach([$this->teamA->id, $this->teamB->id]);
    }

    private function game(array $attributes): Game
    {
        return $this->competition->games()->create(['team_a_id' => $this->teamA->id, 'team_b_id' => $this->teamB->id, ...$attributes]);
    }

    public function test_team_managers_are_notified_once_ten_minutes_before(): void
    {
        Notification::fake();
        $soon = $this->game(['scheduled_at' => now()->addMinutes(9)]);
        $this->game(['scheduled_at' => now()->addMinutes(30)]);
        $this->game(['scheduled_at' => now()->addMinutes(5), 'status' => 'live']);

        $this->artisan('games:send-reminders')->expectsOutput('1 match(s) rappelé(s).')->assertSuccessful();

        Notification::assertSentTo($this->captainA, GameStartingSoon::class, fn ($n, $channels) => $n->game->is($soon) && $channels === ['mail', 'database']);
        Notification::assertSentTo($this->captainB, GameStartingSoon::class);
        Notification::assertCount(2);

        $this->artisan('games:send-reminders')->expectsOutput('0 match(s) rappelé(s).');
        Notification::assertCount(2);
    }

    public function test_rescheduling_a_game_rearms_its_reminder(): void
    {
        Notification::fake();
        $game = $this->game(['scheduled_at' => now()->addMinutes(5)]);
        $this->artisan('games:send-reminders');

        $game->update(['scheduled_at' => now()->addMinutes(8)]);
        $this->assertNull($game->fresh()->reminder_sent_at);

        $this->artisan('games:send-reminders')->expectsOutput('1 match(s) rappelé(s).');
        Notification::assertCount(4);
    }

    public function test_a_manager_of_both_teams_gets_a_single_reminder(): void
    {
        Notification::fake();
        $this->teamB->update(['owner_id' => $this->captainA->id]);
        $this->game(['scheduled_at' => now()->addMinutes(3)]);

        $this->artisan('games:send-reminders');
        Notification::assertSentToTimes($this->captainA, GameStartingSoon::class, 1);
    }

    public function test_demo_accounts_only_get_in_app_notifications(): void
    {
        $this->assertSame(['database'], (new GameStartingSoon($this->game([]), $this->teamA))->via(new User(['email' => 'capitaine1@matchme.test'])));
        $this->assertSame(['mail', 'database'], (new GameStartingSoon($this->game([]), $this->teamA))->via(new User(['email' => 'awa@example.com'])));
    }

    public function test_reminder_email_and_in_app_notification(): void
    {
        $game = $this->game(['scheduled_at' => now()->addMinutes(10)->subSecond(), 'round' => 'Journée 1']);
        $mail = (new GameStartingSoon($game, $this->teamA))->toMail($this->captainA);
        $this->assertStringContainsString('Gaïndé de Thiès – Jambaar de Dakar', $mail->subject);
        $this->assertSame(rtrim(config('app.frontend_url'), '/').'/matchs/'.$game->id, $mail->actionUrl);

        $this->artisan('games:send-reminders');

        Sanctum::actingAs($this->captainA);
        $id = $this->getJson('/api/notifications')
            ->assertJsonPath('unread_count', 1)
            ->assertJsonPath('data.0.type', 'game_starting_soon')
            ->assertJsonPath('data.0.url', '/matchs/'.$game->id)
            ->assertJsonPath('data.0.read', false)
            ->json('data.0.id');

        $this->postJson("/api/notifications/{$id}/read")->assertNoContent();
        $this->getJson('/api/notifications')->assertJsonPath('unread_count', 0)->assertJsonPath('data.0.read', true);

        // Les notifications d'un autre utilisateur sont inaccessibles.
        Sanctum::actingAs($this->captainB);
        $this->postJson("/api/notifications/{$id}/read")->assertNotFound();
        $this->postJson('/api/notifications/read-all')->assertNoContent();
        $this->getJson('/api/notifications')->assertJsonPath('unread_count', 0);
    }
}
