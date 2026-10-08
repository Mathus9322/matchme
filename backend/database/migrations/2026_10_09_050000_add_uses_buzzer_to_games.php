<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Mode d'arbitrage choisi avant le coup d'envoi : barème manuel ou multibuzzer. */
    public function up(): void
    {
        Schema::table('games', fn (Blueprint $table) => $table->boolean('uses_buzzer')->default(false)->after('current_rubric_id'));
    }

    public function down(): void
    {
        Schema::table('games', fn (Blueprint $table) => $table->dropColumn('uses_buzzer'));
    }
};
