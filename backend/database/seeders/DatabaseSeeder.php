<?php

namespace Database\Seeders;

use App\Models\Competition;
use App\Models\FriendlyRequest;
use App\Models\Game;
use App\Models\RubricPreset;
use App\Models\User;
use App\Notifications\CoachAssigned;
use App\Notifications\FriendlyRequestUpdated;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

/**
 * Jeu de données minimal pour tester chaque rôle (mot de passe : « password ») :
 * - admin@matchme.test       administrateur
 * - awa@matchme.test         manager : la compétition et les 4 équipes
 * - moussa@ / fatou@ / ibrahima@ / khady@matchme.test   coachs, un par équipe
 * - spectateur@matchme.test  simple utilisateur (peut « Créer mon espace »)
 */
class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    public function run(): void
    {
        $user = fn (string $name, string $email, string $role = User::ROLE_USER) => User::factory()->create(compact('name', 'email', 'role') + ['password' => 'password']);

        $user('Administrateur', 'admin@matchme.test', User::ROLE_ADMIN);
        $user('Spectateur', 'spectateur@matchme.test');
        $manager = $user('Awa Diop', 'awa@matchme.test', User::ROLE_MANAGER);

        $rosters = [
            ['Xam-Xam de Thiès', 'Thiès', $user('Moussa Ndiaye', 'moussa@matchme.test'), ['Aïda Ndiaye', 'Bamba Fall', 'Coumba Sow', 'Demba Diop', 'Rama Seck', 'Pape Ly']],
            ['Teranga de Dakar', 'Dakar', $user('Fatou Sarr', 'fatou@matchme.test'), ['Fama Gueye', 'Saliou Faye', 'Ndeye Sarr', 'Modou Mbaye', 'Astou Dieng', 'Babou Wade']],
            ['Kocc Barma de Saint-Louis', 'Saint-Louis', $user('Ibrahima Faye', 'ibrahima@matchme.test'), ['Ibrahima Seck', 'Yacine Kane', 'Khadija Thiam', 'Lamine Ba', 'Sokhna Fall', 'Mor Diaw']],
            ['Aline Sitoé de Ziguinchor', 'Ziguinchor', $user('Khady Ba', 'khady@matchme.test'), ['Mariama Diatta', 'Ousmane Badji', 'Oumar Sané', 'Penda Manga', 'Fatou Coly', 'Jules Sagna']],
        ];

        // Équipes créées par la manager, chacune confiée à son coach ; le premier joueur est capitaine.
        $teams = collect($rosters)->map(function (array $roster) use ($manager) {
            [$name, $city, $coach, $players] = $roster;
            $team = $manager->teams()->create(['name' => $name, 'city' => $city, 'coach_id' => $coach->id]);
            foreach ($players as $position => $player) {
                $team->players()->create(['name' => $player, 'position' => $position, 'is_captain' => $position === 0]);
            }

            $coach->notify(new CoachAssigned($team));

            return $team->load('players');
        });
        $coaches = collect($rosters)->pluck(2);

        $competition = Competition::create([
            'owner_id' => $manager->id,
            'name' => 'Coupe régionale de génie en herbe',
            'description' => 'Tournoi inter-lycées en championnat : chaque équipe rencontre toutes les autres.',
            'format' => 'league',
            'starts_on' => now()->subDay()->toDateString(),
            'ends_on' => now()->addWeeks(2)->toDateString(),
            'status' => 'ongoing',
        ]);
        $competition->teams()->attach($teams->pluck('id'));

        foreach (RubricPreset::whereIn('name', ['Questions éclair', 'Culture générale', 'Questions à tiroirs', 'Le face-à-face'])->orderBy('position')->get() as $position => $preset) {
            $competition->rubrics()->create($preset->only(['name', 'description', 'points', 'penalties']) + ['position' => $position]);
        }

        // Un match terminé (avec points marqués), un en direct, un à venir.
        $finished = $competition->games()->create([
            'team_a_id' => $teams[0]->id, 'team_b_id' => $teams[1]->id, 'round' => 'Journée 1',
            'scheduled_at' => now()->subDay(), 'started_at' => now()->subDay(),
        ]);
        $finished->load(['teamA.players', 'teamB.players'])->lockLineups();
        foreach ([[0, 0, 40], [0, 1, 20], [1, 0, 30], [1, 2, 10], [0, 3, 10]] as [$side, $player, $points]) {
            $finished->events()->create(['team_id' => $teams[$side]->id, 'player_id' => $teams[$side]->players[$player]->id, 'user_id' => $manager->id, 'points' => $points]);
        }
        $finished->update(['status' => Game::STATUS_FINISHED, 'finished_at' => now()->subDay()->addHour()]);

        $live = $competition->games()->create([
            'team_a_id' => $teams[2]->id, 'team_b_id' => $teams[3]->id, 'round' => 'Journée 1',
            'scheduled_at' => now(), 'started_at' => now(),
        ]);
        $live->load(['teamA.players', 'teamB.players'])->lockLineups();
        $live->update(['status' => Game::STATUS_LIVE, 'phase' => Game::PHASE_FIRST_HALF]);

        $competition->games()->create([
            'team_a_id' => $teams[0]->id, 'team_b_id' => $teams[2]->id, 'round' => 'Journée 2',
            'scheduled_at' => now()->addDays(3)->setTime(15, 0),
        ]);

        // Matchs amicaux entre coachs : un accepté (programmé), un en attente de réponse.
        $accepted = FriendlyRequest::create([
            'team_id' => $teams[1]->id, 'opponent_id' => $teams[3]->id, 'proposed_by' => $coaches[1]->id,
            'round' => 'Match de préparation', 'scheduled_at' => now()->addDays(5)->setTime(17, 0),
            'status' => FriendlyRequest::STATUS_ACCEPTED, 'answered_at' => now(),
        ]);
        $friendly = Game::create([
            'owner_id' => $coaches[1]->id, 'team_a_id' => $teams[1]->id, 'team_b_id' => $teams[3]->id,
            'round' => $accepted->round, 'scheduled_at' => $accepted->scheduled_at,
        ]);
        $accepted->update(['game_id' => $friendly->id]);

        $pending = FriendlyRequest::create([
            'team_id' => $teams[0]->id, 'opponent_id' => $teams[2]->id, 'proposed_by' => $coaches[0]->id,
            'round' => 'Revanche amicale', 'scheduled_at' => now()->addWeek()->setTime(16, 0),
            'message' => 'Un match amical avant la journée 2 ?', 'status' => FriendlyRequest::STATUS_PENDING,
        ]);
        $coaches[2]->notify(new FriendlyRequestUpdated($pending));

        // Feuilles de score des matchs terminés (dossier Résultats).
        $this->command?->callSilently('result-sheets:generate');
    }
}
