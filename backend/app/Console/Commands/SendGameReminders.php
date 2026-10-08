<?php

namespace App\Console\Commands;

use App\Models\Game;
use App\Notifications\GameStartingSoon;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('games:send-reminders')]
#[Description('Prévient par e-mail et dans la plateforme les managers des équipes dont le match commence bientôt')]
class SendGameReminders extends Command
{
    public function handle(): int
    {
        $games = Game::query()
            ->with(['teamA.owner', 'teamA.coach', 'teamB.owner', 'teamB.coach', 'competition'])
            ->where('status', Game::STATUS_SCHEDULED)
            ->whereNull('reminder_sent_at')
            ->whereBetween('scheduled_at', [now(), now()->addMinutes(Game::REMINDER_MINUTES)])
            ->get();

        foreach ($games as $game) {
            // Marqué avant l'envoi : un échec d'e-mail ne doit pas provoquer de rappels en double.
            $game->forceFill(['reminder_sent_at' => now()])->saveQuietly();

            // Manager et coach de chaque équipe, un seul rappel par personne même s'il gère les deux équipes.
            collect([$game->teamA, $game->teamB])
                ->filter()
                ->flatMap(fn ($team) => collect([$team->owner, $team->coach])->filter()->map(fn ($user) => [$user, $team]))
                ->unique(fn ($pair) => $pair[0]->id)
                ->each(fn ($pair) => $pair[0]->notify(new GameStartingSoon($game, $pair[1])));
        }

        $this->info($games->count().' match(s) rappelé(s).');

        return self::SUCCESS;
    }
}
