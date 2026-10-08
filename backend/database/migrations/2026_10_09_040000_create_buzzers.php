<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Multibuzzer : chaque joueur rejoint le match avec un code depuis son téléphone ;
     * l'arbitre ouvre les buzzers, le premier qui buzze répond.
     */
    public function up(): void
    {
        Schema::table('games', function (Blueprint $table) {
            $table->string('buzzer_code', 6)->nullable()->unique()->after('current_rubric_id');
            // Nom secret du canal temps réel : seuls les joueurs connectés et l'arbitre le connaissent.
            $table->string('buzzer_channel', 40)->nullable()->after('buzzer_code');
            $table->string('buzzer_status', 10)->default('closed')->after('buzzer_channel');
            $table->unsignedInteger('buzzer_round')->default(0)->after('buzzer_status');
            $table->foreignId('buzzer_excluded_team_id')->nullable()->after('buzzer_round')->constrained('teams')->nullOnDelete();
        });

        Schema::create('buzzer_devices', function (Blueprint $table) {
            $table->id();
            $table->foreignId('game_id')->constrained()->cascadeOnDelete();
            $table->foreignId('player_id')->constrained()->cascadeOnDelete();
            $table->string('token_hash', 64)->unique();
            $table->timestamp('last_seen_at')->nullable();
            $table->timestamps();
            $table->unique(['game_id', 'player_id']);
        });

        Schema::create('buzzes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('game_id')->constrained()->cascadeOnDelete();
            $table->foreignId('player_id')->constrained()->cascadeOnDelete();
            $table->foreignId('team_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('round');
            // null : en attente du jugement ; correct / wrong.
            $table->string('result', 10)->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('buzzes');
        Schema::dropIfExists('buzzer_devices');
        Schema::table('games', function (Blueprint $table) {
            $table->dropConstrainedForeignId('buzzer_excluded_team_id');
            $table->dropColumn(['buzzer_code', 'buzzer_channel', 'buzzer_status', 'buzzer_round']);
        });
    }
};
