<?php

namespace App\Events;

use App\Models\Game;
use App\Support\Buzzer;
use Illuminate\Broadcasting\Channel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;

/**
 * État du buzzer poussé aux joueurs et à l'arbitre. Le canal porte un nom secret
 * (connu seulement d'eux) : le public ne peut pas suivre le buzzer.
 */
class BuzzerUpdated implements ShouldBroadcastNow
{
    public function __construct(public Game $game) {}

    public function broadcastOn(): Channel
    {
        return new Channel('buzzer.'.$this->game->buzzer_channel);
    }

    public function broadcastAs(): string
    {
        return 'buzzer.updated';
    }

    /** @return array<string, mixed> */
    public function broadcastWith(): array
    {
        return app(Buzzer::class)->state($this->game);
    }
}
