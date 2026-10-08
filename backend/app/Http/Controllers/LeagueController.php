<?php

namespace App\Http\Controllers;

use App\Models\Competition;
use App\Models\Game;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class LeagueController extends Controller
{
    /**
     * Génère le calendrier d'un championnat par journées (méthode du cercle) :
     * chaque équipe affronte toutes les autres, une fois ou en aller-retour.
     */
    public function schedule(Request $request, Competition $competition): JsonResponse
    {
        abort_unless($competition->isManagedBy($request->user()), 403, 'Vous ne gérez pas cette compétition.');
        abort_unless($competition->format === Competition::FORMAT_LEAGUE, 422, 'Cette compétition n’est pas un championnat.');

        $validated = $request->validate([
            'double' => ['boolean'],
            'replace' => ['boolean'],
            'start_at' => ['nullable', 'date'],
            'interval_days' => ['nullable', 'integer', 'between:0,60'],
        ]);

        $teamIds = $competition->teams()->pluck('teams.id')->shuffle()->values()->all();
        abort_if(count($teamIds) < 2, 422, 'Inscrivez au moins deux équipes.');

        $league = $competition->games()->whereNull('group_id');
        if ((clone $league)->exists()) {
            abort_unless($request->boolean('replace'), 422, 'Un calendrier existe déjà. Cochez « remplacer » pour le régénérer.');
            abort_if((clone $league)->where('status', '!=', Game::STATUS_SCHEDULED)->exists(), 422, 'Des matchs ont déjà commencé : le calendrier ne peut plus être régénéré.');
        }

        $rounds = self::roundRobin($teamIds);
        if ($request->boolean('double')) {
            $returnLeg = array_map(fn ($round) => array_map(fn ($pair) => [$pair[1], $pair[0]], $round), $rounds);
            $rounds = [...$rounds, ...$returnLeg];
        }

        $start = isset($validated['start_at']) ? Carbon::parse($validated['start_at']) : null;
        $interval = $validated['interval_days'] ?? 7;

        $created = DB::transaction(function () use ($competition, $league, $rounds, $start, $interval) {
            $league->delete();
            $count = 0;
            foreach ($rounds as $index => $pairs) {
                foreach ($pairs as [$home, $away]) {
                    $competition->games()->create([
                        'team_a_id' => $home,
                        'team_b_id' => $away,
                        'round' => 'Journée '.($index + 1),
                        'scheduled_at' => $start?->copy()->addDays($index * $interval),
                    ]);
                    $count++;
                }
            }

            return $count;
        });

        return response()->json(['created' => $created, 'rounds' => count($rounds)]);
    }

    /**
     * Méthode du cercle : une équipe fixe, les autres tournent. Avec un nombre impair,
     * une équipe est exempte à chaque journée. Les réceptions alternent pour l'équilibre.
     *
     * @param  list<int>  $teams
     * @return list<list<array{0: int, 1: int}>>
     */
    public static function roundRobin(array $teams): array
    {
        if (count($teams) % 2 === 1) {
            $teams[] = null;
        }

        $n = count($teams);
        $rounds = [];
        for ($r = 0; $r < $n - 1; $r++) {
            $pairs = [];
            for ($i = 0; $i < $n / 2; $i++) {
                [$a, $b] = [$teams[$i], $teams[$n - 1 - $i]];
                if ($a !== null && $b !== null) {
                    $pairs[] = ($r + $i) % 2 === 0 ? [$a, $b] : [$b, $a];
                }
            }
            $rounds[] = $pairs;
            // Rotation : on garde la première équipe, la dernière passe en deuxième position.
            $teams = [$teams[0], $teams[$n - 1], ...array_slice($teams, 1, $n - 2)];
        }

        return $rounds;
    }
}
