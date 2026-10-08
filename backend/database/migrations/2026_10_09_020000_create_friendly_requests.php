<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Proposition de match amical d'un coach à un autre : le match n'est créé qu'à l'acceptation. */
    public function up(): void
    {
        Schema::create('friendly_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('team_id')->constrained()->cascadeOnDelete();
            $table->foreignId('opponent_id')->constrained('teams')->cascadeOnDelete();
            $table->foreignId('proposed_by')->constrained('users')->cascadeOnDelete();
            $table->string('round', 60)->nullable();
            $table->dateTime('scheduled_at')->nullable();
            $table->string('message', 280)->nullable();
            $table->string('status', 16)->default('pending');
            $table->foreignId('game_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamp('answered_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('friendly_requests');
    }
};
