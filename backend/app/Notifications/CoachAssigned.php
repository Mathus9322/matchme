<?php

namespace App\Notifications;

use App\Models\Team;
use Illuminate\Notifications\Notification;

/** Prévient un utilisateur qu'un manager l'a désigné coach d'une équipe. */
class CoachAssigned extends Notification
{
    public function __construct(public Team $team) {}

    /** @return list<string> */
    public function via(object $notifiable): array
    {
        return ['database'];
    }

    /** @return array<string, mixed> */
    public function toArray(object $notifiable): array
    {
        return [
            'type' => 'coach_assigned',
            'team_id' => $this->team->id,
            'title' => "Vous êtes coach de {$this->team->name}",
            'message' => ($this->team->owner?->name ?? 'Un manager').' vous a confié l’équipe : composez votre effectif et proposez des matchs amicaux.',
            'url' => '/equipes/'.$this->team->id,
        ];
    }
}
