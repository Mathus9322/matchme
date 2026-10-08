<?php

namespace App\Notifications;

use App\Models\Game;
use App\Models\Team;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/** Rappel envoyé aux managers d'équipe peu avant le coup d'envoi. */
class GameStartingSoon extends Notification
{
    public function __construct(public Game $game, public Team $team) {}

    /** @return list<string> */
    public function via(object $notifiable): array
    {
        // Le domaine .test (comptes de démonstration) n'existe pas : pas d'e-mail, notification seulement.
        return str_ends_with(strtolower($notifiable->email), '.test') ? ['database'] : ['mail', 'database'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $game = $this->game;

        return (new MailMessage)
            ->subject("C’est bientôt l’heure : {$this->title()}")
            ->greeting("Bonjour {$notifiable->name},")
            ->line("Le match de votre équipe **{$this->team->name}** commence dans ".Game::REMINDER_MINUTES.' minutes.')
            ->line("**{$this->title()}**")
            ->line($this->context().' · coup d’envoi à '.$game->scheduled_at->timezone(config('app.timezone'))->format('H:i').'.')
            ->action('Suivre le match en direct', $this->url())
            ->line('Bonne chance à vos joueurs !')
            ->salutation('L’équipe MatchMe');
    }

    /** @return array<string, mixed> */
    public function toArray(object $notifiable): array
    {
        return [
            'type' => 'game_starting_soon',
            'game_id' => $this->game->id,
            'team_id' => $this->team->id,
            'title' => $this->title(),
            'message' => "Le match de {$this->team->name} commence dans ".Game::REMINDER_MINUTES.' minutes · '.$this->context().'.',
            'starts_at' => $this->game->scheduled_at?->toIso8601String(),
            'url' => '/matchs/'.$this->game->id,
        ];
    }

    private function title(): string
    {
        return "{$this->game->teamA->name} – {$this->game->teamB->name}";
    }

    private function context(): string
    {
        $where = $this->game->competition?->name ?? 'Match amical';

        return $this->game->round ? "{$where} · {$this->game->round}" : $where;
    }

    private function url(): string
    {
        return rtrim(config('app.frontend_url'), '/').'/matchs/'.$this->game->id;
    }
}
