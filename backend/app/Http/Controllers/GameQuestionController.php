<?php

namespace App\Http\Controllers;

use App\Http\Resources\GameResource;
use App\Models\Game;
use App\Models\GameQuestion;
use App\Support\QuestionSheetParser;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Smalot\PdfParser\Parser;
use Throwable;

/** Questions du match : import PDF, édition, affichage au public et révélation des réponses. */
class GameQuestionController extends Controller
{
    /** Importe un PDF et le transforme en liste de questions (remplace ou complète la liste). */
    public function import(Request $request, Game $game, QuestionSheetParser $parser): JsonResponse
    {
        $this->authorizeGame($request, $game);
        $request->validate([
            'file' => ['required', 'file', 'mimes:pdf', 'max:10240'],
            'mode' => ['nullable', 'in:replace,append'],
        ], [
            'file.required' => 'Choisissez le PDF des questions.',
            'file.mimes' => 'Le fichier doit être un PDF.',
            'file.max' => 'Le PDF doit faire au plus 10 Mo.',
            'file.uploaded' => 'Le PDF n’a pas pu être envoyé.',
        ]);

        try {
            $text = (new Parser)->parseFile($request->file('file')->getRealPath())->getText();
        } catch (Throwable) {
            abort(422, 'Ce PDF ne peut pas être lu. Vérifiez qu’il contient du texte (pas une image scannée).');
        }

        $items = $parser->parse($text);
        abort_if($items === [], 422, 'Aucune question reconnue. Utilisez le modèle : « 1. Question … » puis « Réponse : … ».');

        $replace = $request->input('mode', 'replace') === 'replace';
        abort_if(
            $replace && $game->questions()->where('status', '!=', GameQuestion::STATUS_PENDING)->exists(),
            422,
            'Des questions ont déjà été posées : importez en mode « ajouter à la suite ».',
        );

        DB::transaction(function () use ($game, $items, $replace, $request) {
            if ($replace) {
                $game->questions()->delete();
            }
            $position = (int) $game->questions()->max('position');
            foreach ($items as $item) {
                $game->questions()->create([...$item, 'position' => ++$position]);
            }
            $game->update(['questions_source' => mb_substr($request->file('file')->getClientOriginalName(), 0, 255)]);
        });

        return response()->json(['imported' => count($items), 'data' => $this->detailed($game)]);
    }

    public function store(Request $request, Game $game): GameResource
    {
        $this->authorizeGame($request, $game);
        $game->questions()->create([...$this->validated($request), 'position' => (int) $game->questions()->max('position') + 1]);

        return $this->detailed($game);
    }

    public function update(Request $request, GameQuestion $question): GameResource
    {
        $this->authorizeGame($request, $question->game);
        $question->update($this->validated($request));

        return $this->detailed($question->game);
    }

    public function destroy(Request $request, GameQuestion $question): GameResource
    {
        $game = $question->game;
        $this->authorizeGame($request, $game);
        abort_if($question->status !== GameQuestion::STATUS_PENDING, 422, 'Une question déjà posée ne peut plus être supprimée.');
        $question->delete();

        return $this->detailed($game);
    }

    /** Affiche la question au public : elle devient la question en cours. */
    public function show(Request $request, GameQuestion $question): GameResource
    {
        $game = $question->game;
        $this->authorizeGame($request, $game);
        abort_unless($game->status === Game::STATUS_LIVE, 422, 'Démarrez le match pour poser les questions.');
        abort_unless($game->isInPlay(), 422, 'Les questions avancent uniquement pendant le jeu, pas à la mi-temps.');

        $question->update([
            'status' => $question->status === GameQuestion::STATUS_PENDING ? GameQuestion::STATUS_SHOWN : $question->status,
            'shown_at' => $question->shown_at ?? now(),
        ]);
        $game->update(['current_question_id' => $question->id]);

        return $this->detailed($game);
    }

    /** Révèle la réponse au public. */
    public function reveal(Request $request, GameQuestion $question): GameResource
    {
        $game = $question->game;
        $this->authorizeGame($request, $game);
        abort_unless($game->isInPlay(), 422, 'Les questions avancent uniquement pendant le jeu.');
        abort_if($question->status === GameQuestion::STATUS_PENDING, 422, 'Affichez la question avant de révéler la réponse.');

        $question->update(['status' => GameQuestion::STATUS_REVEALED, 'revealed_at' => $question->revealed_at ?? now()]);
        $game->touch();

        return $this->detailed($game);
    }

    private function validated(Request $request): array
    {
        return $request->validate([
            'question' => ['required', 'string', 'max:2000'],
            'answer' => ['nullable', 'string', 'max:2000'],
            'rubric' => ['nullable', 'string', 'max:80'],
            'points' => ['nullable', 'integer', 'between:1,500'],
        ]);
    }

    private function authorizeGame(Request $request, Game $game): void
    {
        abort_unless($game->isManagedBy($request->user()), 403, 'Vous ne gérez pas ce match.');
    }

    private function detailed(Game $game): GameResource
    {
        $game->refresh()->load(GameResource::DETAIL_RELATIONS);

        return (new GameResource($game))->detailed();
    }
}
