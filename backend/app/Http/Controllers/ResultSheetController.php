<?php

namespace App\Http\Controllers;

use App\Models\Competition;
use App\Models\ResultSheet;
use Illuminate\Http\JsonResponse;

/** Sous-dossier « Résultats » : feuilles de score des matchs terminés (publiques, comme les résultats). */
class ResultSheetController extends Controller
{
    public function index(Competition $competition): JsonResponse
    {
        $sheets = $competition->resultSheets()->get()->sortByDesc(fn (ResultSheet $sheet) => $sheet->data['finished_at'] ?? '')->values();

        return response()->json(['data' => $sheets->map(fn (ResultSheet $sheet) => [
            'id' => $sheet->id,
            'game_id' => $sheet->game_id,
            'title' => $sheet->title,
            'round' => $sheet->data['round'] ?? null,
            'score' => $sheet->data['team_a']['score'].' – '.$sheet->data['team_b']['score'],
            'finished_at' => $sheet->data['finished_at'] ?? null,
            'updated_at' => $sheet->updated_at,
        ])]);
    }

    public function show(ResultSheet $sheet): JsonResponse
    {
        return response()->json(['data' => ['id' => $sheet->id, 'game_id' => $sheet->game_id, 'title' => $sheet->title, ...$sheet->data]]);
    }
}
