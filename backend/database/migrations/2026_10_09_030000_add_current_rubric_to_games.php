<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Rubrique en cours, avancée par le manager du match pendant le jeu et suivie par tous. */
    public function up(): void
    {
        Schema::table('games', fn (Blueprint $table) => $table->foreignId('current_rubric_id')->nullable()->after('current_question_id')->constrained('competition_rubrics')->nullOnDelete());
    }

    public function down(): void
    {
        Schema::table('games', fn (Blueprint $table) => $table->dropConstrainedForeignId('current_rubric_id'));
    }
};
