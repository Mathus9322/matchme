<?php

namespace Tests\Feature;

use App\Models\Competition;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ManagedUserTest extends TestCase
{
    use RefreshDatabase;

    private User $manager;

    private User $otherManager;

    private Team $mine;

    private Team $external;

    private Team $unrelated;

    protected function setUp(): void
    {
        parent::setUp();
        $this->manager = User::factory()->manager()->create();
        $this->otherManager = User::factory()->manager()->create();

        $this->mine = Team::create(['owner_id' => $this->manager->id, 'coach_id' => User::factory()->create(['name' => 'Coach Awa'])->id, 'name' => 'Lynx']);
        // Équipe d'un autre manager inscrite à ma compétition : son coach est aussi sous ma gestion.
        $this->external = Team::create(['owner_id' => $this->otherManager->id, 'coach_id' => User::factory()->create(['name' => 'Coach Bara'])->id, 'name' => 'Comètes']);
        $this->unrelated = Team::create(['owner_id' => $this->otherManager->id, 'coach_id' => User::factory()->create(['name' => 'Coach Codou'])->id, 'name' => 'Autres']);
        Competition::create(['owner_id' => $this->manager->id, 'name' => 'Coupe', 'status' => 'open'])->teams()->attach($this->external->id);
    }

    public function test_a_manager_lists_the_coaches_under_his_management(): void
    {
        Sanctum::actingAs($this->manager);
        $this->getJson('/api/manage/users')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.name', 'Coach Awa')
            ->assertJsonPath('data.1.name', 'Coach Bara')
            ->assertJsonCount(2, 'teams')
            ->assertJsonPath('teams.0.name', 'Comètes')
            ->assertJsonPath('teams.0.external', true);

        Sanctum::actingAs(User::factory()->create());
        $this->getJson('/api/manage/users')->assertForbidden();
    }

    public function test_a_manager_creates_edits_and_deletes_coach_accounts(): void
    {
        Sanctum::actingAs($this->manager);
        $this->postJson('/api/manage/users', ['name' => 'X', 'email' => 'x@example.com', 'password' => 'secret123', 'team_id' => $this->unrelated->id])
            ->assertJsonValidationErrors('team_id');
        $id = $this->postJson('/api/manage/users', ['name' => 'Coach Neuf', 'email' => 'neuf@example.com', 'password' => 'secret123', 'team_id' => $this->mine->id])
            ->assertCreated()->assertJsonPath('data.teams.0.name', 'Lynx')->json('data.id');
        $this->assertSame($id, $this->mine->fresh()->coach_id);
        $this->assertSame(1, User::find($id)->notifications()->count());

        $this->putJson("/api/manage/users/{$id}", ['name' => 'Coach Renommé', 'email' => 'renomme@example.com', 'password' => 'nouveau123'])
            ->assertOk()->assertJsonPath('data.name', 'Coach Renommé');
        $this->assertTrue(Hash::check('nouveau123', User::find($id)->password));

        // Hors de ma gestion, ou compte de manager : interdit.
        $this->putJson("/api/manage/users/{$this->unrelated->coach_id}", ['name' => 'Pirate', 'email' => 'p@example.com'])->assertForbidden();
        $this->external->update(['coach_id' => $this->otherManager->id]);
        $this->putJson("/api/manage/users/{$this->otherManager->id}", ['name' => 'Pirate', 'email' => 'p@example.com'])->assertForbidden();

        // Suppression : l'équipe revient à son manager.
        $this->deleteJson("/api/manage/users/{$id}")->assertNoContent();
        $this->assertNull(User::find($id));
        $this->assertSame($this->manager->id, $this->mine->fresh()->coach_id);
    }

    public function test_a_coach_shared_with_another_manager_cannot_be_deleted(): void
    {
        $this->unrelated->update(['coach_id' => $this->mine->coach_id]);
        Sanctum::actingAs($this->manager);
        $this->deleteJson("/api/manage/users/{$this->mine->coach_id}")->assertStatus(422);
    }

    public function test_a_manager_reassigns_the_coach_of_controlled_teams(): void
    {
        $newCoach = User::factory()->create();
        Sanctum::actingAs($this->manager);

        $this->putJson("/api/manage/teams/{$this->external->id}/coach", ['coach_id' => $newCoach->id])->assertOk();
        $this->assertSame($newCoach->id, $this->external->fresh()->coach_id);
        $this->assertSame(1, $newCoach->notifications()->count());

        $this->putJson("/api/manage/teams/{$this->mine->id}/coach", ['coach_id' => null])->assertJsonValidationErrors('coach_id');
        $this->putJson("/api/manage/teams/{$this->unrelated->id}/coach", ['coach_id' => $newCoach->id])->assertForbidden();
    }
}
