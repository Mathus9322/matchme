<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Image de couverture des cartes de compétition (disque « public »). */
    public function up(): void
    {
        Schema::table('competitions', fn (Blueprint $table) => $table->string('cover_path')->nullable()->after('description'));
    }

    public function down(): void
    {
        Schema::table('competitions', fn (Blueprint $table) => $table->dropColumn('cover_path'));
    }
};
