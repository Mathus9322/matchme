<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('competition_groups', function (Blueprint $table) {
            $table->id();
            $table->foreignId('competition_id')->constrained()->cascadeOnDelete();
            $table->string('name', 40);
            $table->unsignedSmallInteger('position')->default(0);
            $table->timestamps();
        });

        Schema::table('competition_team', function (Blueprint $table) {
            $table->foreignId('group_id')->nullable()->constrained('competition_groups')->nullOnDelete();
        });

        Schema::table('games', function (Blueprint $table) {
            $table->foreignId('group_id')->nullable()->after('competition_id')->constrained('competition_groups')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('games', fn (Blueprint $table) => $table->dropConstrainedForeignId('group_id'));
        Schema::table('competition_team', fn (Blueprint $table) => $table->dropConstrainedForeignId('group_id'));
        Schema::dropIfExists('competition_groups');
    }
};
