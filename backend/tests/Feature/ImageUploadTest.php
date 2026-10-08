<?php

namespace Tests\Feature;

use App\Models\Competition;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ImageUploadTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
    }

    public function test_user_can_set_and_remove_their_avatar(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $url = $this->post('/api/auth/me/avatar', ['image' => UploadedFile::fake()->image('moi.jpg', 300, 300)], ['Accept' => 'application/json'])
            ->assertOk()->json('data.avatar_url');
        $this->assertStringStartsWith('/storage/avatars/', $url);
        Storage::disk('public')->assertExists(substr($url, 9));

        // Remplacer l'image supprime l'ancien fichier.
        $this->post('/api/auth/me/avatar', ['image' => UploadedFile::fake()->image('moi2.png')], ['Accept' => 'application/json'])->assertOk();
        Storage::disk('public')->assertMissing(substr($url, 9));

        $this->deleteJson('/api/auth/me/avatar')->assertJsonPath('data.avatar_url', null);
        $this->assertCount(0, Storage::disk('public')->allFiles('avatars'));
    }

    public function test_rejects_non_images(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $this->post('/api/auth/me/avatar', ['image' => UploadedFile::fake()->create('cv.pdf', 10, 'application/pdf')], ['Accept' => 'application/json'])
            ->assertJsonValidationErrors('image');
    }

    public function test_team_logo_and_player_photos_appear_in_the_match(): void
    {
        $manager = Sanctum::actingAs(User::factory()->manager()->create());
        $manager->storeImage(UploadedFile::fake()->image('manager.jpg'));
        $team = Team::create(['owner_id' => $manager->id, 'name' => 'Gaïndé']);
        $player = $team->players()->create(['name' => 'Awa Ndiaye']);
        $other = Team::create(['owner_id' => $manager->id, 'name' => 'Jambaar']);

        $this->post("/api/teams/{$team->id}/logo", ['image' => UploadedFile::fake()->image('logo.png')], ['Accept' => 'application/json'])
            ->assertOk()->assertJsonPath('data.logo_url', fn ($url) => str_starts_with($url, '/storage/logos/'));
        $this->post("/api/players/{$player->id}/photo", ['image' => UploadedFile::fake()->image('awa.jpg')], ['Accept' => 'application/json'])
            ->assertOk();

        $competition = Competition::create(['owner_id' => $manager->id, 'name' => 'Coupe', 'status' => 'ongoing']);
        $competition->teams()->attach([$team->id, $other->id]);
        $game = $competition->games()->create(['team_a_id' => $team->id, 'team_b_id' => $other->id]);

        $this->getJson("/api/games/{$game->id}")
            ->assertJsonPath('data.manager.name', $manager->name)
            ->assertJsonPath('data.manager.avatar_url', $manager->imageUrl())
            ->assertJsonPath('data.team_a.logo_url', $team->fresh()->imageUrl())
            ->assertJsonPath('data.team_a.players.0.photo_url', $player->fresh()->imageUrl())
            ->assertJsonPath('data.team_b.logo_url', null);
    }

    public function test_friendly_manager_is_its_creator(): void
    {
        $user = Sanctum::actingAs(User::factory()->create(['name' => 'Arbitre']));
        $id = $this->postJson('/api/games/friendly', [
            'team_a' => ['name' => 'A', 'players' => ['a1', 'a2', 'a3', 'a4']],
            'team_b' => ['name' => 'B', 'players' => ['b1', 'b2', 'b3', 'b4']],
        ])->json('data.id');

        $this->getJson("/api/games/{$id}")->assertJsonPath('data.manager.name', 'Arbitre');
    }

    public function test_only_the_team_owner_can_change_images_and_files_are_cleaned_up(): void
    {
        $owner = User::factory()->create();
        $team = Team::create(['owner_id' => $owner->id, 'name' => 'Gaïndé']);
        $player = $team->players()->create(['name' => 'Awa']);

        Sanctum::actingAs(User::factory()->create());
        $this->post("/api/teams/{$team->id}/logo", ['image' => UploadedFile::fake()->image('x.png')], ['Accept' => 'application/json'])->assertForbidden();
        $this->post("/api/players/{$player->id}/photo", ['image' => UploadedFile::fake()->image('x.png')], ['Accept' => 'application/json'])->assertForbidden();

        Sanctum::actingAs($owner);
        $this->post("/api/teams/{$team->id}/logo", ['image' => UploadedFile::fake()->image('logo.png')], ['Accept' => 'application/json']);
        $this->post("/api/players/{$player->id}/photo", ['image' => UploadedFile::fake()->image('awa.png')], ['Accept' => 'application/json']);
        $this->assertCount(2, Storage::disk('public')->allFiles());

        // Retirer le joueur de l'effectif supprime sa photo, supprimer l'équipe supprime le logo.
        $this->putJson("/api/teams/{$team->id}", ['name' => 'Gaïndé', 'players' => [['name' => 'N1'], ['name' => 'N2'], ['name' => 'N3'], ['name' => 'N4']]])->assertOk();
        $this->assertCount(0, Storage::disk('public')->allFiles('players'));
        $this->deleteJson("/api/teams/{$team->id}")->assertNoContent();
        $this->assertCount(0, Storage::disk('public')->allFiles());
    }
}
