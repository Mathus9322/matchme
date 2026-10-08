<?php

use App\Http\Controllers\AdminController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\CompetitionController;
use App\Http\Controllers\CompetitionDocumentController;
use App\Http\Controllers\CompetitionGroupController;
use App\Http\Controllers\CompetitionRubricController;
use App\Http\Controllers\GameController;
use App\Http\Controllers\ImageController;
use App\Http\Controllers\LeagueController;
use App\Http\Controllers\ManageController;
use App\Http\Controllers\MatchSheetController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\ResultSheetController;
use App\Http\Controllers\TeamController;
use App\Http\Controllers\TeamStatsController;
use App\Http\Middleware\EnsureUserIsAdmin;
use App\Http\Middleware\EnsureUserIsStaff;
use Illuminate\Support\Facades\Route;

Route::post('/auth/register', [AuthController::class, 'register']);
Route::post('/auth/login', [AuthController::class, 'login'])->middleware('throttle:10,1');

// Consultation publique : compétitions, équipes et matchs en direct.
Route::get('/competitions', [CompetitionController::class, 'index']);
Route::get('/competitions/{competition}', [CompetitionController::class, 'show']);
Route::get('/teams', [TeamController::class, 'index']);
Route::get('/teams/{team}', [TeamController::class, 'show']);
Route::get('/teams/{team}/stats', [TeamStatsController::class, 'team']);
Route::get('/players/{player}/stats', [TeamStatsController::class, 'player']);
Route::get('/games', [GameController::class, 'index']);
Route::get('/rubric-presets', [CompetitionRubricController::class, 'presets']);
Route::get('/competitions/{competition}/result-sheets', [ResultSheetController::class, 'index']);
Route::get('/result-sheets/{sheet}', [ResultSheetController::class, 'show']);
Route::get('/games/{game}', [GameController::class, 'show']);

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/auth/me', [AuthController::class, 'me']);
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::post('/notifications/read-all', [NotificationController::class, 'markAllRead']);
    Route::post('/notifications/{id}/read', [NotificationController::class, 'markRead']);
    Route::post('/auth/me/avatar', [ImageController::class, 'storeAvatar']);
    Route::delete('/auth/me/avatar', [ImageController::class, 'destroyAvatar']);
    Route::post('/teams/{team}/logo', [ImageController::class, 'storeLogo']);
    Route::delete('/teams/{team}/logo', [ImageController::class, 'destroyLogo']);
    Route::post('/players/{player}/photo', [ImageController::class, 'storePlayerPhoto']);
    Route::delete('/players/{player}/photo', [ImageController::class, 'destroyPlayerPhoto']);

    Route::put('/teams/{team}', [TeamController::class, 'update']);
    Route::delete('/teams/{team}', [TeamController::class, 'destroy']);

    Route::post('/competitions', [CompetitionController::class, 'store']);
    Route::put('/competitions/{competition}', [CompetitionController::class, 'update']);
    Route::delete('/competitions/{competition}', [CompetitionController::class, 'destroy']);
    Route::post('/competitions/{competition}/publish', [CompetitionController::class, 'publish']);
    Route::post('/competitions/{competition}/finish', [CompetitionController::class, 'finish']);
    Route::post('/competitions/{competition}/reopen', [CompetitionController::class, 'reopen']);
    Route::post('/competitions/{competition}/teams', [CompetitionController::class, 'attachTeam']);
    Route::delete('/competitions/{competition}/teams/{team}', [CompetitionController::class, 'detachTeam']);
    Route::post('/competitions/{competition}/games', [GameController::class, 'store']);

    Route::put('/competitions/{competition}/scoring', [CompetitionRubricController::class, 'updateScoring']);
    Route::post('/competitions/{competition}/rubrics', [CompetitionRubricController::class, 'store']);
    Route::post('/competitions/{competition}/rubrics/presets', [CompetitionRubricController::class, 'storePresets']);
    Route::put('/rubrics/{rubric}', [CompetitionRubricController::class, 'update']);
    Route::delete('/rubrics/{rubric}', [CompetitionRubricController::class, 'destroy']);
    Route::post('/rubrics/{rubric}/move', [CompetitionRubricController::class, 'move']);

    Route::post('/competitions/{competition}/league/schedule', [LeagueController::class, 'schedule']);

    Route::post('/competitions/{competition}/groups', [CompetitionGroupController::class, 'store']);
    Route::post('/competitions/{competition}/groups/draw', [CompetitionGroupController::class, 'draw']);
    Route::put('/competitions/{competition}/teams/{team}/group', [CompetitionGroupController::class, 'assignTeam']);
    Route::put('/groups/{group}', [CompetitionGroupController::class, 'update']);
    Route::delete('/groups/{group}', [CompetitionGroupController::class, 'destroy']);
    Route::post('/groups/{group}/schedule', [CompetitionGroupController::class, 'schedule']);

    Route::put('/games/{game}', [GameController::class, 'update']);
    Route::delete('/games/{game}', [GameController::class, 'destroy']);
    Route::post('/games/{game}/start', [GameController::class, 'start']);
    Route::post('/games/{game}/finish', [GameController::class, 'finish']);
    Route::post('/games/{game}/events', [GameController::class, 'score']);
    Route::delete('/games/{game}/events/last', [GameController::class, 'undo']);
    Route::put('/games/{game}/lineup', [MatchSheetController::class, 'lineup']);
    Route::post('/games/{game}/halftime', [MatchSheetController::class, 'halftime']);
    Route::post('/games/{game}/second-half', [MatchSheetController::class, 'secondHalf']);
    Route::post('/games/{game}/substitutions', [MatchSheetController::class, 'substitute']);
    Route::post('/games/{game}/swap', [MatchSheetController::class, 'swap']);

    // Espace de gestion : managers et administrateurs.
    Route::middleware(EnsureUserIsStaff::class)->group(function () {
        Route::get('/manage/overview', [ManageController::class, 'overview']);
        Route::post('/teams', [TeamController::class, 'store']);
        Route::post('/games/friendly', [GameController::class, 'storeFriendly']);
        Route::get('/competitions/{competition}/documents', [CompetitionDocumentController::class, 'index']);
        Route::post('/competitions/{competition}/documents', [CompetitionDocumentController::class, 'store']);
        Route::get('/documents/{document}/download', [CompetitionDocumentController::class, 'download']);
        Route::delete('/documents/{document}', [CompetitionDocumentController::class, 'destroy']);
    });

    Route::middleware(EnsureUserIsAdmin::class)->prefix('admin')->group(function () {
        Route::get('/stats', [AdminController::class, 'stats']);
        Route::get('/users', [AdminController::class, 'users']);
        Route::put('/users/{user}', [AdminController::class, 'updateUser']);
        Route::delete('/users/{user}', [AdminController::class, 'destroyUser']);
    });
});
