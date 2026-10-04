<?php

namespace App\Http\Controllers;

use App\Models\MatchRecord;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MatchController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'team_a.name' => ['required', 'string', 'max:80'],
            'team_a.players' => ['required', 'array', 'size:4'],
            'team_a.players.*' => ['required', 'string', 'max:60'],
            'team_b.name' => ['required', 'string', 'max:80'],
            'team_b.players' => ['required', 'array', 'size:4'],
            'team_b.players.*' => ['required', 'string', 'max:60'],
        ]);

        $match = MatchRecord::create([
            'team_a_name' => $validated['team_a']['name'],
            'team_a_players' => $validated['team_a']['players'],
            'team_b_name' => $validated['team_b']['name'],
            'team_b_players' => $validated['team_b']['players'],
        ]);

        return response()->json(['data' => $this->matchData($match)], 201);
    }

    public function show(MatchRecord $match): JsonResponse
    {
        return response()->json(['data' => $this->matchData($match)]);
    }

    private function matchData(MatchRecord $match): array
    {
        return [
            'id' => $match->id,
            'team_a' => [
                'name' => $match->team_a_name,
                'players' => $match->team_a_players,
            ],
            'team_b' => [
                'name' => $match->team_b_name,
                'players' => $match->team_b_players,
            ],
        ];
    }
}