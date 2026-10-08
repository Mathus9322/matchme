<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Ordre des joueurs sur la feuille de match (échangeable, conservé lors d'un remplacement). */
    public function up(): void
    {
        Schema::table('game_players', fn (Blueprint $table) => $table->unsignedSmallInteger('position')->default(0)->after('on_field'));
    }

    public function down(): void
    {
        Schema::table('game_players', fn (Blueprint $table) => $table->dropColumn('position'));
    }
};
