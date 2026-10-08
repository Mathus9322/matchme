<?php

namespace Tests\Feature;

use App\Models\Competition;
use App\Models\Game;
use App\Models\ResultSheet;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class GameQuestionTest extends TestCase
{
    use RefreshDatabase;

    private User $manager;

    private Game $game;

    private Team $home;

    protected function setUp(): void
    {
        parent::setUp();
        $this->manager = Sanctum::actingAs(User::factory()->manager()->create());
        $competition = Competition::create(['owner_id' => $this->manager->id, 'name' => 'Coupe de Thiès', 'status' => 'ongoing']);
        $this->home = $this->teamWithPlayers($this->manager->id, 'Gaïndé');
        $away = $this->teamWithPlayers($this->manager->id, 'Jambaar');
        $competition->teams()->attach([$this->home->id, $away->id]);
        $this->game = $competition->games()->create(['team_a_id' => $this->home->id, 'team_b_id' => $away->id]);
    }

    private function import(string $mode = 'replace')
    {
        $pdf = new UploadedFile(base_path('tests/fixtures/questions.pdf'), 'questions-finale.pdf', 'application/pdf', null, true);

        return $this->post("/api/games/{$this->game->id}/questions/import", ['file' => $pdf, 'mode' => $mode], ['Accept' => 'application/json']);
    }

    private function publicGame(): array
    {
        $this->app['auth']->forgetGuards();

        return $this->withHeaders(['Authorization' => ''])->getJson("/api/games/{$this->game->id}")->json('data');
    }

    public function test_the_manager_imports_a_pdf_into_a_question_file(): void
    {
        $this->import()->assertOk()
            ->assertJsonPath('imported', 4)
            ->assertJsonPath('data.questions_source', 'questions-finale.pdf')
            ->assertJsonPath('data.questions.0.rubric', 'Questions eclair')
            ->assertJsonPath('data.questions.0.answer', 'Dakar')
            ->assertJsonPath('data.questions.0.points', 10)
            ->assertJsonPath('data.questions.2.question', 'Qui a ecrit le roman Une si longue lettre ?');

        // Correction manuelle, ajout et suppression.
        $id = $this->game->questions()->first()->id;
        $this->putJson("/api/questions/{$id}", ['question' => 'Quelle est la capitale du Sénégal ?', 'answer' => 'Dakar', 'rubric' => 'Questions éclair', 'points' => 10])
            ->assertJsonPath('data.questions.0.question', 'Quelle est la capitale du Sénégal ?');
        $this->postJson("/api/games/{$this->game->id}/questions", ['question' => 'Question bonus ?', 'answer' => 'Oui'])->assertJsonCount(5, 'data.questions');
        $this->deleteJson('/api/questions/'.$this->game->questions()->latest('id')->first()->id)->assertJsonCount(4, 'data.questions');

        $this->import('append')->assertJsonPath('imported', 4);
        $this->assertSame(8, $this->game->questions()->count());
    }

    public function test_unreadable_or_empty_pdfs_are_rejected(): void
    {
        $this->post("/api/games/{$this->game->id}/questions/import", ['file' => UploadedFile::fake()->create('scan.pdf', 5, 'application/pdf')], ['Accept' => 'application/json'])
            ->assertStatus(422);
        $this->post("/api/games/{$this->game->id}/questions/import", ['file' => UploadedFile::fake()->image('photo.png')], ['Accept' => 'application/json'])
            ->assertJsonValidationErrors('file');
    }

    public function test_the_public_only_sees_shown_questions_and_revealed_answers_with_who_answered(): void
    {
        $this->import();
        [$q1, $q2] = $this->game->questions()->take(2)->get();
        $player = $this->home->players()->first();

        // Avant le coup d'envoi : rien de visible pour le public.
        $this->assertSame([], $this->publicGame()['questions']);

        Sanctum::actingAs($this->manager);
        $this->postJson("/api/questions/{$q1->id}/show")->assertStatus(422);
        $this->postJson("/api/games/{$this->game->id}/start", ['uses_buzzer' => false]);
        $this->postJson("/api/questions/{$q1->id}/reveal")->assertStatus(422);
        $this->postJson("/api/questions/{$q1->id}/show")->assertJsonPath('data.current_question_id', $q1->id);

        // Question affichée : texte visible, réponse cachée, question suivante inconnue.
        $public = $this->publicGame();
        $this->assertCount(1, $public['questions']);
        $this->assertSame('Quelle est la capitale du Senegal ?', $public['questions'][0]['question']);
        $this->assertNull($public['questions'][0]['answer']);
        $this->assertArrayNotHasKey('questions_source', $public);

        // Le point marqué est rattaché à la question en cours.
        Sanctum::actingAs($this->manager);
        $this->postJson("/api/games/{$this->game->id}/events", ['team_id' => $this->home->id, 'player_id' => $player->id, 'points' => 10])
            ->assertJsonPath('data.questions.0.answered.0.player', $player->name)
            ->assertJsonPath('data.events.0.question_id', $q1->id);
        $this->postJson("/api/questions/{$q1->id}/reveal")->assertOk();

        $public = $this->publicGame();
        $this->assertSame('Dakar', $public['questions'][0]['answer']);
        $this->assertSame($player->name, $public['questions'][0]['answered'][0]['player']);
        $this->assertSame(10, $public['questions'][0]['answered'][0]['points']);

        // Une question posée ne peut plus être supprimée, ni la liste remplacée.
        Sanctum::actingAs($this->manager);
        $this->deleteJson("/api/questions/{$q1->id}")->assertStatus(422);
        $this->import()->assertStatus(422);
        $this->deleteJson("/api/questions/{$q2->id}")->assertOk();

        // Les questions posées figurent sur la feuille de score.
        $this->toSecondHalf($this->game->id);
        $this->postJson("/api/games/{$this->game->id}/finish");
        $sheet = ResultSheet::first()->data;
        $this->assertCount(1, $sheet['questions']);
        $this->assertSame('Dakar', $sheet['questions'][0]['answer']);
        $this->assertSame($player->name, $sheet['questions'][0]['answered'][0]['player']);
    }

    public function test_only_the_match_manager_handles_questions(): void
    {
        Sanctum::actingAs(User::factory()->manager()->create());
        $this->import()->assertForbidden();
    }
}
