<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Feuilles de score « virtuelles » : un instantané figé de chaque match terminé,
     * rangé dans le sous-dossier Résultats de la compétition et exportable en PDF ou PNG.
     */
    public function up(): void
    {
        Schema::create('result_sheets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('competition_id')->constrained()->cascadeOnDelete();
            $table->foreignId('game_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('title');
            $table->json('data');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('result_sheets');
    }
};
