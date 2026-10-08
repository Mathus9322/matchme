<?php

namespace App\Console\Commands;

use App\Models\Game;
use App\Models\ResultSheet;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('result-sheets:generate {--all : Régénère aussi les feuilles existantes}')]
#[Description('Crée les feuilles de score manquantes des matchs de compétition terminés')]
class GenerateResultSheets extends Command
{
    public function handle(): int
    {
        $games = Game::query()
            ->where('status', Game::STATUS_FINISHED)
            ->whereNotNull('competition_id')
            ->unless($this->option('all'), fn ($q) => $q->doesntHave('resultSheet'))
            ->get();

        $games->each(fn (Game $game) => ResultSheet::capture($game));
        $this->info($games->count().' feuille(s) de score générée(s).');

        return self::SUCCESS;
    }
}
