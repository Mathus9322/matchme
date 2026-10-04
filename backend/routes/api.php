<?php

use App\Http\Controllers\MatchController;
use Illuminate\Support\Facades\Route;

Route::post('/matches', [MatchController::class, 'store']);
Route::get('/matches/{match}', [MatchController::class, 'show']);