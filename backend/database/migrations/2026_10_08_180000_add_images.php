<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Photos de profil, photos des joueurs et logos d'équipe (disque « public »). */
    public function up(): void
    {
        Schema::table('users', fn (Blueprint $table) => $table->string('avatar_path')->nullable()->after('role'));
        Schema::table('players', fn (Blueprint $table) => $table->string('photo_path')->nullable()->after('name'));
        Schema::table('teams', fn (Blueprint $table) => $table->string('logo_path')->nullable()->after('city'));
    }

    public function down(): void
    {
        Schema::table('users', fn (Blueprint $table) => $table->dropColumn('avatar_path'));
        Schema::table('players', fn (Blueprint $table) => $table->dropColumn('photo_path'));
        Schema::table('teams', fn (Blueprint $table) => $table->dropColumn('logo_path'));
    }
};
