<?php

namespace App\Notifications;

use App\Models\FriendlyRequest;
use Illuminate\Notifications\Notification;

/** Proposition de match amical reçue, acceptée, refusée ou annulée. */
class FriendlyRequestUpdated extends Notification
{
    public function __construct(public FriendlyRequest $request) {}

    /** @return list<string> */
    public function via(object $notifiable): array
    {
        return ['database'];
    }

    /** @return array<string, mixed> */
    public function toArray(object $notifiable): array
    {
        $r = $this->request;
        $from = $r->team->name;
        $to = $r->opponent->name;

        [$title, $message] = match ($r->status) {
            FriendlyRequest::STATUS_ACCEPTED => ["Match amical accepté : {$from} – {$to}", "{$to} a accepté votre proposition. Le match est programmé."],
            FriendlyRequest::STATUS_DECLINED => ["Match amical refusé : {$from} – {$to}", "{$to} a décliné votre proposition."],
            FriendlyRequest::STATUS_CANCELLED => ["Proposition annulée : {$from} – {$to}", "{$from} a retiré sa proposition de match amical."],
            default => ["{$from} vous propose un match amical", "{$r->proposer->name} propose à {$to} un match amical. Acceptez ou refusez depuis l’espace Matchs amicaux."],
        };

        return [
            'type' => 'friendly_request',
            'friendly_request_id' => $r->id,
            'game_id' => $r->game_id,
            'title' => $title,
            'message' => $message,
            'url' => $r->game_id ? '/matchs/'.$r->game_id : '/amical',
        ];
    }
}
