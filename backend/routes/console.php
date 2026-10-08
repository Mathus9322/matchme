<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Rappels 10 minutes avant les matchs (lancer « php artisan schedule:work » en développement).
Schedule::command('games:send-reminders')->everyMinute()->withoutOverlapping();
