<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Un match amical n'appartient à aucune compétition : il est géré par son créateur.
     */
    public function up(): void
    {
        Schema::table('games', function (Blueprint $table) {
            $table->foreignId('competition_id')->nullable()->change();
            $table->foreignId('owner_id')->nullable()->after('competition_id')->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('games', function (Blueprint $table) {
            $table->dropConstrainedForeignId('owner_id');
        });
    }
};
