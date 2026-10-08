<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Feuille de match (4 titulaires + 2 remplaçants maximum par équipe),
     * mi-temps et remplacements.
     */
    public function up(): void
    {
        Schema::table('games', function (Blueprint $table) {
            // first_half, halftime ou second_half pendant un match en cours.
            $table->string('phase', 20)->nullable()->after('status');
        });

        Schema::create('game_players', function (Blueprint $table) {
            $table->id();
            $table->foreignId('game_id')->constrained()->cascadeOnDelete();
            $table->foreignId('team_id')->constrained()->cascadeOnDelete();
            $table->foreignId('player_id')->constrained()->cascadeOnDelete();
            $table->string('role', 20);
            $table->boolean('on_field')->default(false);
            $table->timestamps();
            $table->unique(['game_id', 'player_id']);
        });

        Schema::create('substitutions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('game_id')->constrained()->cascadeOnDelete();
            $table->foreignId('team_id')->constrained()->cascadeOnDelete();
            $table->foreignId('player_out_id')->nullable()->constrained('players')->nullOnDelete();
            $table->foreignId('player_in_id')->nullable()->constrained('players')->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('substitutions');
        Schema::dropIfExists('game_players');
        Schema::table('games', fn (Blueprint $table) => $table->dropColumn('phase'));
    }
};
