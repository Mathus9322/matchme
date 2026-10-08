<?php

namespace App\Support;

use App\Events\BuzzerUpdated;
use App\Models\Buzz;
use App\Models\BuzzerDevice;
use App\Models\Game;
use App\Models\Player;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Multibuzzer : l'arbitre ouvre les buzzers, le premier joueur qui buzze verrouille les autres.
 * Bonne réponse : la manche se ferme. Mauvaise réponse : seule l'équipe adverse peut encore buzzer.
 */
class Buzzer
{
    public const CLOSED = 'closed';

    public const OPEN = 'open';

    public const LOCKED = 'locked';

    /** Code à 6 chiffres et canal secret, créés à la première ouverture du panneau par l'arbitre. */
    public function ensureCode(Game $game, bool $regenerate = false): Game
    {
        if ($game->buzzer_code && ! $regenerate) {
            return $game;
        }
        do {
            $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        } while (Game::where('buzzer_code', $code)->exists());

        DB::transaction(function () use ($game, $code, $regenerate) {
            if ($regenerate) {
                // Nouveau code : tous les téléphones doivent se reconnecter.
                BuzzerDevice::where('game_id', $game->id)->delete();
            }
            $game->forceFill(['buzzer_code' => $code, 'buzzer_channel' => Str::random(32)])->saveQuietly();
        });

        return $game;
    }

    public function open(Game $game): void
    {
        $game->forceFill([
            'buzzer_status' => self::OPEN,
            'buzzer_round' => $game->buzzer_round + 1,
            'buzzer_excluded_team_id' => null,
        ])->save();
        $this->announce($game);
    }

    public function close(Game $game): void
    {
        $game->forceFill(['buzzer_status' => self::CLOSED, 'buzzer_excluded_team_id' => null])->save();
        $this->announce($game);
    }

    /**
     * Buzz d'un joueur : seul le premier compte. Transaction verrouillée sur le match
     * pour que deux buzz simultanés ne gagnent pas tous les deux.
     */
    public function buzz(Game $game, Player $player): bool
    {
        $won = DB::transaction(function () use ($game, $player) {
            $fresh = Game::whereKey($game->id)->lockForUpdate()->first();
            if (! $fresh->isInPlay() || $fresh->buzzer_status !== self::OPEN || $fresh->buzzer_excluded_team_id === $player->team_id) {
                return false;
            }
            $fresh->load(['teamA.players', 'teamB.players', 'sheet']);
            if (! $fresh->isOnField($player->id)) {
                return false;
            }
            Buzz::create(['game_id' => $fresh->id, 'player_id' => $player->id, 'team_id' => $player->team_id, 'round' => $fresh->buzzer_round]);
            $fresh->forceFill(['buzzer_status' => self::LOCKED])->save();

            return true;
        });

        if ($won) {
            $this->announce($game->refresh());
        }

        return $won;
    }

    /** L'arbitre juge la réponse du joueur qui a la main : correct, wrong ou passed. */
    public function judge(Game $game, string $result): void
    {
        $buzz = $this->winner($game);
        abort_unless($game->buzzer_status === self::LOCKED && $buzz, 422, 'Aucun joueur n’a la main.');

        $buzz->update(['result' => $result]);

        if ($result === Buzz::CORRECT || $game->buzzer_excluded_team_id !== null) {
            // Bonne réponse, ou les deux équipes se sont trompées : la manche est terminée.
            $game->forceFill(['buzzer_status' => self::CLOSED, 'buzzer_excluded_team_id' => null])->save();
        } else {
            // Mauvaise réponse ou joueur qui passe : la main passe à l'équipe adverse.
            $game->forceFill(['buzzer_status' => self::OPEN, 'buzzer_excluded_team_id' => $buzz->team_id])->save();
        }
        $this->announce($game);
    }

    /** Le buzz qui a la main dans la manche en cours (non encore jugé). */
    public function winner(Game $game): ?Buzz
    {
        return Buzz::with(['player', 'team'])
            ->where('game_id', $game->id)
            ->where('round', $game->buzzer_round)
            ->whereNull('result')
            ->oldest('id')
            ->first();
    }

    /** État partagé, sans secret : diffusé sur le canal et renvoyé aux joueurs et à l'arbitre. */
    public function state(Game $game): array
    {
        $winner = $game->buzzer_status === self::LOCKED ? $this->winner($game) : null;
        $last = Buzz::with('player')->where('game_id', $game->id)->where('round', $game->buzzer_round)->whereNotNull('result')->latest('id')->first();

        return [
            'game_id' => $game->id,
            'status' => $game->buzzer_status,
            'round' => $game->buzzer_round,
            'in_play' => $game->isInPlay(),
            'game_status' => $game->status,
            'phase' => $game->phase,
            'excluded_team_id' => $game->buzzer_excluded_team_id,
            'winner' => $winner ? ['player_id' => $winner->player_id, 'name' => $winner->player->name, 'team_id' => $winner->team_id, 'team' => $winner->team->name] : null,
            // Dernier jugement de la manche, pour l'afficher sur les téléphones.
            'last' => $last ? ['player_id' => $last->player_id, 'name' => $last->player->name, 'team_id' => $last->team_id, 'result' => $last->result] : null,
        ];
    }

    /** Pousse l'état en temps réel ; sans serveur Reverb, les écrans se rafraîchissent par interrogation. */
    public function announce(Game $game): void
    {
        if (! $game->buzzer_channel) {
            return;
        }
        // event() diffuse immédiatement (ShouldBroadcastNow) : une erreur de connexion est bien rattrapée ici.
        rescue(fn () => event(new BuzzerUpdated($game)), report: false);
    }
}
