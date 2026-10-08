<?php

namespace Database\Seeders;

use App\Models\Competition;
use App\Models\Game;
use App\Models\RubricPreset;
use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $admin = User::factory()->create([
            'name' => 'Administrateur',
            'email' => 'admin@matchme.test',
            'password' => 'password',
            'role' => User::ROLE_ADMIN,
        ]);

        $organizer = User::factory()->create([
            'name' => 'Awa Diop',
            'email' => 'awa@matchme.test',
            'password' => 'password',
            'role' => User::ROLE_MANAGER,
        ]);

        $rosters = [
            'Xam-Xam de Thiès' => ['Thiès', ['Aïda Ndiaye', 'Bamba Fall', 'Coumba Sow', 'Demba Diop', 'Rama Seck', 'Pape Ly']],
            'Teranga de Dakar' => ['Dakar', ['Fama Gueye', 'Saliou Faye', 'Ndeye Sarr', 'Modou Mbaye', 'Astou Dieng', 'Babou Wade']],
            'Kocc Barma de Saint-Louis' => ['Saint-Louis', ['Ibrahima Seck', 'Yacine Kane', 'Khadija Thiam', 'Lamine Ba', 'Sokhna Fall', 'Mor Diaw']],
            'Aline Sitoé de Ziguinchor' => ['Ziguinchor', ['Mariama Diatta', 'Ousmane Badji', 'Oumar Sané', 'Penda Manga', 'Fatou Coly', 'Jules Sagna']],
        ];

        $teams = collect($rosters)->map(function (array $roster, string $name) use ($organizer) {
            [$city, $players] = $roster;
            $team = $organizer->teams()->create(['name' => $name, 'city' => $city]);
            foreach ($players as $position => $player) {
                $team->players()->create(['name' => $player, 'position' => $position]);
            }

            return $team;
        })->values();

        $competition = Competition::create([
            'owner_id' => $organizer->id,
            'name' => 'Coupe régionale de génie en herbe',
            'description' => 'Tournoi inter-lycées, phase de poules.',
            'starts_on' => now()->toDateString(),
            'ends_on' => now()->addWeeks(2)->toDateString(),
            'status' => 'ongoing',
        ]);
        $competition->teams()->attach($teams->pluck('id'));

        foreach (RubricPreset::whereIn('name', ['Questions éclair', 'Culture générale', 'Questions à tiroirs', 'Le face-à-face'])->orderBy('position')->get() as $position => $preset) {
            $competition->rubrics()->create([
                'name' => $preset->name,
                'description' => $preset->description,
                'points' => $preset->points,
                'penalties' => $preset->penalties,
                'position' => $position,
            ]);
        }

        $finished = $competition->games()->create([
            'team_a_id' => $teams[0]->id, 'team_b_id' => $teams[1]->id, 'round' => 'Journée 1',
            'status' => Game::STATUS_FINISHED, 'scheduled_at' => now()->subDay(),
            'started_at' => now()->subDay(), 'finished_at' => now()->subDay()->addHour(),
        ]);
        foreach ([[0, 0, 40], [0, 1, 20], [1, 0, 30], [0, null, 10]] as [$side, $playerIndex, $points]) {
            $team = $teams[$side];
            $finished->events()->create([
                'team_id' => $team->id,
                'player_id' => $playerIndex === null ? null : $team->players[$playerIndex]->id,
                'user_id' => $admin->id,
                'points' => $points,
            ]);
        }

        $competition->games()->create([
            'team_a_id' => $teams[2]->id, 'team_b_id' => $teams[3]->id, 'round' => 'Journée 1',
            'status' => Game::STATUS_LIVE, 'phase' => Game::PHASE_FIRST_HALF, 'scheduled_at' => now(), 'started_at' => now(),
        ]);

        $competition->games()->create([
            'team_a_id' => $teams[0]->id, 'team_b_id' => $teams[2]->id, 'round' => 'Journée 2',
            'scheduled_at' => now()->addDays(3),
        ]);

        $this->call(DemoCompetitionsSeeder::class);

        // Feuilles de score des matchs terminés (dossier Résultats).
        $this->command?->callSilently('result-sheets:generate');
    }
}
