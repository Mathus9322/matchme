<?php

namespace Tests\Unit;

use App\Support\QuestionSheetParser;
use PHPUnit\Framework\TestCase;

class QuestionSheetParserTest extends TestCase
{
    public function test_it_reads_rubrics_numbering_variants_points_and_continuations(): void
    {
        $text = <<<'TXT'
        Questions du match
        Thème : Sciences
        Question 1 : Combien de côtés a un hexagone ? [10]
        Réponse : Six
        2 - Quel gaz respirons-nous
        pour vivre ?
        Rép : L’oxygène
        Rubrique 2 – Sport
        Q3 Quel pays a gagné la CAN 2021 ? (40 points)
        R – Le Sénégal
        4. Question sans réponse
        TXT;

        $questions = (new QuestionSheetParser)->parse($text);

        $this->assertCount(4, $questions);
        $this->assertSame(['rubric' => 'Sciences', 'question' => 'Combien de côtés a un hexagone ?', 'answer' => 'Six', 'points' => 10], $questions[0]);
        $this->assertSame('Quel gaz respirons-nous pour vivre ?', $questions[1]['question']);
        $this->assertSame('L’oxygène', $questions[1]['answer']);
        $this->assertSame(['rubric' => 'Sport', 'question' => 'Quel pays a gagné la CAN 2021 ?', 'answer' => 'Le Sénégal', 'points' => 40], $questions[2]);
        $this->assertNull($questions[3]['answer']);
    }

    public function test_text_without_questions_gives_nothing(): void
    {
        $this->assertSame([], (new QuestionSheetParser)->parse("Bonjour\nCeci n’est pas une feuille de questions."));
    }
}
