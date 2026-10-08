<?php

namespace App\Support;

/**
 * Extrait les questions et réponses du texte d'un PDF de match.
 *
 * Format reconnu (une question par bloc, lignes de continuation acceptées) :
 *   Rubrique : Culture générale
 *   1. Quelle est la capitale du Sénégal ? (20 pts)
 *   Réponse : Dakar
 * Variantes acceptées : « Q1 », « Question 1 : », « 1) », « R : », « Rép. », « Thème : ».
 */
class QuestionSheetParser
{
    private const RUBRIC = '/^(?:rubrique|th[èe]me|cat[ée]gorie|manche)\s*(?:\d+\s*)?[:\-–]\s*(.+)$/iu';

    private const QUESTION = '/^(?:q(?:uestion)?\s*n?[°º]?\s*)?(\d{1,3})\s*[.):\-–]\s*(.+)$/iu';

    private const QUESTION_PREFIXED = '/^q(?:uestion)?\s*n?[°º]?\s*(\d{1,3})\s+(.+)$/iu';

    private const ANSWER = '/^(?:r[ée]ponse|r[ée]p\.?|r)\s*[.:\-–]\s*(.*)$/iu';

    private const POINTS = '/\s*[(\[]\s*(\d{1,3})\s*(?:pts?|points?)?\s*[)\]]\s*$/iu';

    /**
     * @return list<array{rubric: ?string, question: string, answer: ?string, points: ?int}>
     */
    public function parse(string $text): array
    {
        $questions = [];
        $rubric = null;
        $current = null;
        $field = null;

        $lines = preg_split('/\R/u', $this->normalize($text));

        foreach ($lines as $raw) {
            $line = trim(preg_replace('/\s+/u', ' ', $raw));
            if ($line === '') {
                continue;
            }

            if (preg_match(self::RUBRIC, $line, $m)) {
                $this->push($questions, $current);
                $rubric = trim($m[1]);
                $current = $field = null;
            } elseif (preg_match(self::ANSWER, $line, $m) && $current !== null) {
                $current['answer'] = trim($m[1]);
                $field = 'answer';
            } elseif (preg_match(self::QUESTION, $line, $m) || preg_match(self::QUESTION_PREFIXED, $line, $m)) {
                $this->push($questions, $current);
                $current = ['rubric' => $rubric, 'question' => trim($m[2]), 'answer' => null, 'points' => null];
                $field = 'question';
            } elseif ($current !== null && $field !== null) {
                // Ligne de continuation (question ou réponse sur plusieurs lignes).
                $current[$field] = trim(($current[$field] ?? '').' '.$line);
            }
        }

        $this->push($questions, $current);

        return $questions;
    }

    /** @param list<array<string, mixed>> $questions */
    private function push(array &$questions, ?array $current): void
    {
        if ($current === null || $current['question'] === '') {
            return;
        }
        if (preg_match(self::POINTS, $current['question'], $m)) {
            $current['points'] = (int) $m[1];
            $current['question'] = trim(preg_replace(self::POINTS, '', $current['question']));
        }
        $current['answer'] = $current['answer'] !== null && $current['answer'] !== '' ? $current['answer'] : null;
        $questions[] = $current;
    }

    private function normalize(string $text): string
    {
        // Espaces insécables et tabulations issus de l'extraction PDF.
        return str_replace(["\u{00A0}", "\u{202F}", "\t", "\r"], [' ', ' ', ' ', ''], $text);
    }
}
