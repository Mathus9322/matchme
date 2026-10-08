<?php

namespace Database\Seeders;

use App\Models\Competition;
use App\Models\CompetitionGroup;
use App\Models\Game;
use App\Models\RubricPreset;
use App\Models\ScoreEvent;
use App\Models\Team;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;

/**
 * 20 compétitions de démonstration, chacune organisée par un manager différent.
 * Jeu de données volumineux, non lancé par défaut : php artisan db:seed --class=DemoCompetitionsSeeder
 */
class DemoCompetitionsSeeder extends Seeder
{
    private const MANAGERS = [
        'Fatou Sarr', 'Moussa Ndiaye', 'Aminata Fall', 'Cheikh Diallo', 'Khady Ba',
        'Ousmane Sow', 'Mame Diarra Gueye', 'Ibrahima Faye', 'Ndèye Thiam', 'Abdoulaye Cissé',
        'Coumba Mbaye', 'Babacar Seck', 'Astou Kane', 'Mamadou Diop', 'Rokhaya Niang',
        'Pape Sy', 'Seynabou Diouf', 'Alioune Samb', 'Marième Touré', 'Lamine Camara',
    ];

    /** Adresses réelles, pour tester la réception des e-mails de rappel. */
    private const EMAIL_OVERRIDES = [
        'Lamine Camara' => '2mohamedn002@gmail.com',
    ];

    private const COMPETITIONS = [
        'Coupe de Thiès', 'Tournoi inter-lycées de Dakar', 'Championnat régional de Saint-Louis', 'Trophée de Kaolack',
        'Coupe de Ziguinchor', 'Open de Mbour', 'Challenge de Touba', 'Coupe universitaire de Thiès',
        'Tournoi de Rufisque', 'Coupe de Louga', 'Trophée de Tambacounda', 'Tournoi de Kolda',
        'Coupe de Fatick', 'Championnat de Diourbel', 'Coupe de Matam', 'Tournoi de Kédougou',
        'Coupe de Sédhiou', 'Trophée de Kaffrine', 'Tournoi des collèges de Pikine', 'Super coupe nationale',
    ];

    /** Noms d'équipes sénégalais : animaux en wolof, anciens royaumes, figures et culture. */
    private const TEAM_NAMES = ['Gaïndé', 'Jambaar', 'Cayor', 'Walo', 'Djolof', 'Saloum', 'Sine', 'Fouta', 'Ndiambour', 'Lat Dior', 'Ndar', 'Mbalax'];

    private const LAST_NAMES = ['Ndiaye', 'Diop', 'Fall', 'Sow', 'Ba', 'Gueye', 'Faye', 'Sarr', 'Mbaye', 'Diouf', 'Seck', 'Kane', 'Thiam', 'Cissé', 'Niang', 'Sy', 'Diallo', 'Camara', 'Touré', 'Samb'];

    private const CITIES = ['Thiès', 'Dakar', 'Saint-Louis', 'Kaolack'];

    private const FIRST_NAMES = ['Awa', 'Modou', 'Binta', 'Saliou', 'Adama', 'Yacine', 'Omar', 'Dieynaba', 'Serigne', 'Fatim', 'Malick', 'Aïssatou', 'Djibril', 'Oumy', 'Elhadji', 'Sokhna', 'Ismaïla', 'Nafissatou', 'Tidiane', 'Arame'];

    private const STATUSES = ['ongoing', 'finished', 'open', 'draft'];

    public function run(): void
    {
        mt_srand(2026);

        $teams = $this->createTeams();

        foreach (self::MANAGERS as $i => $name) {
            $manager = User::factory()->manager()->create([
                'name' => $name,
                'email' => self::EMAIL_OVERRIDES[$name] ?? Str::slug($name, '.').'@matchme.test',
                'password' => 'password',
            ]);

            $this->createCompetition($i, $manager, $teams);
        }
    }

    /** 48 équipes (12 noms × 4 villes) de 6 joueurs (4 titulaires, 2 remplaçants), réparties entre 12 capitaines. */
    private function createTeams(): Collection
    {
        $captains = collect(range(1, 12))->map(fn ($n) => User::factory()->create([
            'name' => self::FIRST_NAMES[$n].' '.self::LAST_NAMES[($n * 3) % 20],
            'email' => "capitaine{$n}@matchme.test",
            'password' => 'password',
            // Les capitaines gèrent leurs équipes : rôle manager (espace de gestion).
            'role' => User::ROLE_MANAGER,
        ]));

        $teams = collect();
        foreach (self::CITIES as $c => $city) {
            foreach (self::TEAM_NAMES as $t => $label) {
                $team = Team::create([
                    'owner_id' => $captains[($c * 12 + $t) % 12]->id,
                    'coach_id' => $captains[($c * 12 + $t) % 12]->id,
                    'name' => "{$label} de {$city}",
                    'city' => $city,
                ]);
                // Noms tirés sans remise : pas d'homonymes dans une même équipe.
                $names = [];
                while (count($names) < 6) {
                    $names[self::FIRST_NAMES[mt_rand(0, 19)].' '.self::LAST_NAMES[mt_rand(0, 19)]] = true;
                }
                foreach (array_keys($names) as $position => $name) {
                    $team->players()->create(['name' => $name, 'position' => $position, 'is_captain' => $position === 0]);
                }
                $teams->push($team->load('players'));
            }
        }

        return $teams;
    }

    private function createCompetition(int $i, User $manager, Collection $pool): void
    {
        $status = self::STATUSES[$i % 4];
        $startsOn = match ($status) {
            'finished' => now()->subWeeks(6 + $i),
            'ongoing' => now()->subDays(3 + $i % 5),
            default => now()->addWeeks(2 + $i % 6),
        };

        $size = [4, 6, 8][$i % 3];

        $competition = Competition::create([
            'owner_id' => $manager->id,
            // 4 équipes : championnat ; 6 ou 8 : poules.
            'format' => $size >= 6 ? Competition::FORMAT_GROUPS : Competition::FORMAT_LEAGUE,
            'name' => self::COMPETITIONS[$i],
            'description' => 'Compétition de génie en herbe organisée par '.$manager->name.'.',
            'starts_on' => $startsOn->toDateString(),
            'ends_on' => $startsOn->copy()->addWeeks(3)->toDateString(),
            'status' => $status,
        ]);

        // 4, 6 ou 8 équipes, choisies dans le vivier en décalant d'une compétition à l'autre.
        $teams = collect(range(0, $size - 1))->map(fn ($k) => $pool[($i * 5 + $k * 7) % $pool->count()])->unique('id')->values();
        $competition->teams()->attach($teams->pluck('id'));

        // Les compétitions à venir ont déjà leur programme de rubriques.
        if (in_array($status, ['open', 'draft'], true)) {
            RubricPreset::orderBy('position')->get()->slice($i % 5, 4)->values()->each(fn ($preset, $position) => $competition->rubrics()->create([
                'name' => $preset->name,
                'description' => $preset->description,
                'points' => $preset->points,
                'penalties' => $preset->penalties,
                'position' => $position,
            ]));
        }

        if ($status === 'draft') {
            return;
        }

        // Les compétitions de 6 ou 8 équipes se jouent en deux poules.
        $groups = $size >= 6 ? $this->createGroups($competition, $teams) : collect([null => $teams]);

        $fixtures = collect();
        foreach ($groups as $groupId => $members) {
            foreach ($members->values() as $a => $teamA) {
                foreach ($members->values()->slice($a + 1) as $teamB) {
                    $fixtures->push([$groupId ?: null, $teamA, $teamB]);
                }
            }
        }

        if ($status === 'open') {
            $fixtures = $fixtures->take(2);
        }

        $finishedUntil = match ($status) {
            'finished' => $fixtures->count(),
            'ongoing' => intdiv($fixtures->count() * 3, 5),
            default => 0,
        };

        foreach ($fixtures->values() as $n => [$groupId, $teamA, $teamB]) {
            $date = Carbon::parse($startsOn)->addDays($n)->setTime(9 + $n % 8, 0);
            $state = $n < $finishedUntil ? Game::STATUS_FINISHED : ($status === 'ongoing' && $n === $finishedUntil ? Game::STATUS_LIVE : Game::STATUS_SCHEDULED);

            $game = $competition->games()->create([
                'group_id' => $groupId,
                'team_a_id' => $teamA->id,
                'team_b_id' => $teamB->id,
                'round' => $groupId ? $competition->groups->firstWhere('id', $groupId)->name : 'Journée '.($n + 1),
                'scheduled_at' => $state === Game::STATUS_LIVE ? now() : $date,
                'status' => $state,
                'phase' => $state === Game::STATUS_LIVE ? Game::PHASE_FIRST_HALF : null,
                'started_at' => $state === Game::STATUS_SCHEDULED ? null : ($state === Game::STATUS_LIVE ? now()->subMinutes(20) : $date),
                'finished_at' => $state === Game::STATUS_FINISHED ? $date->copy()->addHour() : null,
            ]);

            if ($state !== Game::STATUS_SCHEDULED) {
                $this->createEvents($game, $teamA, $teamB, $manager, $state === Game::STATUS_LIVE ? 4 : mt_rand(6, 12));
            }
        }
    }

    /** Deux poules (A et B), les équipes réparties en alternance. */
    private function createGroups(Competition $competition, Collection $teams): Collection
    {
        $groups = collect([0, 1])->map(fn ($p) => $competition->groups()->create(['name' => 'Poule '.CompetitionGroup::letter($p), 'position' => $p]));
        $competition->setRelation('groups', $groups);

        return $teams->values()->groupBy(fn ($team, $k) => $groups[$k % 2]->id, preserveKeys: false)
            ->each(fn ($members, $groupId) => $members->each(fn ($team) => $competition->teams()->updateExistingPivot($team->id, ['group_id' => $groupId])));
    }

    private function createEvents(Game $game, Team $teamA, Team $teamB, User $manager, int $count): void
    {
        $now = now();
        $events = [];
        for ($e = 0; $e < $count; $e++) {
            $team = mt_rand(0, 1) ? $teamA : $teamB;
            $events[] = [
                'game_id' => $game->id,
                'team_id' => $team->id,
                'player_id' => mt_rand(0, 4) === 0 ? null : $team->players[mt_rand(0, 3)]->id,
                'user_id' => $manager->id,
                'points' => [10, 20, 30, 40, 10, 20, -10][mt_rand(0, 6)],
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }
        ScoreEvent::insert($events);
    }
}
