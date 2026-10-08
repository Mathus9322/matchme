<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Questions du match (« fichier virtuel » importé depuis un PDF) :
     * affichées une à une au public, réponse révélée ensuite, points rattachés.
     */
    public function up(): void
    {
        Schema::create('game_questions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('game_id')->constrained()->cascadeOnDelete();
            $table->unsignedSmallInteger('position')->default(0);
            $table->string('rubric', 80)->nullable();
            $table->text('question');
            $table->text('answer')->nullable();
            $table->unsignedSmallInteger('points')->nullable();
            // pending (cachée), shown (affichée), revealed (réponse révélée)
            $table->string('status', 20)->default('pending');
            $table->dateTime('shown_at')->nullable();
            $table->dateTime('revealed_at')->nullable();
            $table->timestamps();
        });

        Schema::table('games', function (Blueprint $table) {
            $table->foreignId('current_question_id')->nullable()->after('phase')->constrained('game_questions')->nullOnDelete();
            $table->string('questions_source')->nullable()->after('current_question_id');
        });

        Schema::table('score_events', function (Blueprint $table) {
            $table->foreignId('question_id')->nullable()->after('rubric_id')->constrained('game_questions')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('score_events', fn (Blueprint $table) => $table->dropConstrainedForeignId('question_id'));
        Schema::table('games', function (Blueprint $table) {
            $table->dropConstrainedForeignId('current_question_id');
            $table->dropColumn('questions_source');
        });
        Schema::dropIfExists('game_questions');
    }
};
