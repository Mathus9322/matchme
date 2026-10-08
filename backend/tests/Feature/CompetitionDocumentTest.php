<?php

namespace Tests\Feature;

use App\Models\Competition;
use App\Models\CompetitionDocument;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CompetitionDocumentTest extends TestCase
{
    use RefreshDatabase;

    private User $organizer;

    private Competition $competition;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        $this->organizer = User::factory()->create();
        $this->competition = Competition::create(['owner_id' => $this->organizer->id, 'name' => 'Coupe', 'status' => 'open']);
    }

    public function test_each_user_gets_a_private_folder_per_competition(): void
    {
        $alice = Sanctum::actingAs(User::factory()->create(['name' => 'Alice']));

        $this->post("/api/competitions/{$this->competition->id}/documents", [
            'files' => [UploadedFile::fake()->create('inscription.pdf', 120, 'application/pdf')],
        ], ['Accept' => 'application/json'])->assertCreated()->assertJsonPath('data.0.name', 'inscription.pdf');

        $path = CompetitionDocument::first()->path;
        $this->assertStringStartsWith("competitions/{$this->competition->id}/users/{$alice->id}/", $path);
        Storage::disk('local')->assertExists($path);

        // Un autre participant ne voit que son propre dossier (vide).
        $bob = Sanctum::actingAs(User::factory()->create());
        $this->getJson("/api/competitions/{$this->competition->id}/documents")
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.user.id', $bob->id)
            ->assertJsonCount(0, 'data.0.documents');
        $this->get('/api/documents/'.CompetitionDocument::first()->id.'/download', ['Accept' => 'application/json'])->assertForbidden();

        // L'organisateur voit tous les dossiers et peut télécharger.
        Sanctum::actingAs($this->organizer);
        $this->getJson("/api/competitions/{$this->competition->id}/documents")
            ->assertJsonPath('can_manage', true)
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.1.user.name', 'Alice');
        $this->get('/api/documents/'.CompetitionDocument::first()->id.'/download')->assertOk()->assertDownload('inscription.pdf');
    }

    public function test_deleting_a_document_removes_the_file(): void
    {
        Sanctum::actingAs($this->organizer);
        $this->post("/api/competitions/{$this->competition->id}/documents", [
            'files' => [UploadedFile::fake()->image('affiche.png')],
        ], ['Accept' => 'application/json'])->assertCreated();

        $document = CompetitionDocument::first();
        $this->deleteJson("/api/documents/{$document->id}")->assertNoContent();
        Storage::disk('local')->assertMissing($document->path);
    }

    public function test_deleting_the_competition_removes_all_folders(): void
    {
        Sanctum::actingAs($this->organizer);
        $this->post("/api/competitions/{$this->competition->id}/documents", [
            'files' => [UploadedFile::fake()->create('reglement.pdf', 10, 'application/pdf')],
        ], ['Accept' => 'application/json']);

        $this->deleteJson("/api/competitions/{$this->competition->id}")->assertNoContent();
        Storage::disk('local')->assertMissing("competitions/{$this->competition->id}");
        $this->assertDatabaseCount('competition_documents', 0);
    }

    public function test_rejects_disallowed_file_types(): void
    {
        Sanctum::actingAs($this->organizer);
        $this->post("/api/competitions/{$this->competition->id}/documents", [
            'files' => [UploadedFile::fake()->create('script.php', 1, 'application/x-php')],
        ], ['Accept' => 'application/json'])->assertUnprocessable();
    }
}
