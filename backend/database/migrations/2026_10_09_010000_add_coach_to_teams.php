<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Chaque équipe a un coach (un utilisateur désigné par le manager) qui gère son effectif. */
    public function up(): void
    {
        Schema::table('teams', fn (Blueprint $table) => $table->foreignId('coach_id')->nullable()->after('owner_id')->constrained('users')->nullOnDelete());

        // Équipes existantes : le créateur en devient le coach.
        DB::table('teams')->whereNull('coach_id')->update(['coach_id' => DB::raw('owner_id')]);
    }

    public function down(): void
    {
        Schema::table('teams', fn (Blueprint $table) => $table->dropConstrainedForeignId('coach_id'));
    }
};
