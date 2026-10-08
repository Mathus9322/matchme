<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Format de la compétition : « groups » (poules) ou « league » (championnat, tous contre tous).
     */
    public function up(): void
    {
        Schema::table('competitions', function (Blueprint $table) {
            $table->string('format', 20)->default('groups')->after('status');
        });
    }

    public function down(): void
    {
        Schema::table('competitions', fn (Blueprint $table) => $table->dropColumn('format'));
    }
};
