<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Barème par défaut de la compétition : {"points": [10, 20, 30, 40], "penalties": true}.
        Schema::table('competitions', function (Blueprint $table) {
            $table->json('scoring')->nullable()->after('status');
        });

        Schema::create('competition_rubrics', function (Blueprint $table) {
            $table->id();
            $table->foreignId('competition_id')->constrained()->cascadeOnDelete();
            $table->string('name', 80);
            $table->text('description')->nullable();
            $table->json('points');
            $table->boolean('penalties')->default(true);
            $table->unsignedSmallInteger('position')->default(0);
            $table->timestamps();
        });

        Schema::table('score_events', function (Blueprint $table) {
            $table->foreignId('rubric_id')->nullable()->after('player_id')->constrained('competition_rubrics')->nullOnDelete();
        });

        // Catalogue de rubriques prêtes à l'emploi, que l'organisateur peut reprendre et adapter.
        Schema::create('rubric_presets', function (Blueprint $table) {
            $table->id();
            $table->string('name', 80);
            $table->text('description');
            $table->json('points');
            $table->boolean('penalties')->default(true);
            $table->unsignedSmallInteger('position')->default(0);
            $table->timestamps();
        });

        $presets = [
            ['Questions éclair', 'Série de questions courtes posées à toute vitesse. Le premier joueur qui buzze répond ; une mauvaise réponse est pénalisée.', [10], true],
            ['Culture générale', 'Questions variées de difficulté croissante, ouvertes aux deux équipes. Plus la question est difficile, plus elle rapporte.', [10, 20, 30, 40], true],
            ['Questions individuelles', 'Chaque joueur reçoit sa propre question et répond seul, sans l’aide de ses coéquipiers.', [20], false],
            ['Questions à tiroirs', 'Une suite d’indices révélés un à un : plus l’équipe trouve tôt, plus elle marque (40 au premier indice, 10 au dernier).', [40, 30, 20, 10], true],
            ['Le relais', 'Questions d’équipe avec concertation. Les joueurs se relaient pour répondre à une série de questions liées.', [30], false],
            ['Actualité', 'Questions sur les faits marquants de l’actualité nationale et internationale des derniers mois.', [10, 20], true],
            ['Histoire et géographie du Sénégal', 'Royaumes, figures historiques, régions, fleuves et grandes dates du Sénégal.', [10, 20, 30], true],
            ['Sciences et techniques', 'Mathématiques, physique, sciences de la vie et de la Terre, inventions et technologies.', [10, 20, 30], true],
            ['Littérature africaine', 'Auteurs, œuvres et personnages de la littérature africaine et sénégalaise.', [20, 30], true],
            ['Arts et musique', 'Musique sénégalaise et africaine, cinéma, peinture, sculpture et patrimoine culturel.', [10, 20], true],
            ['Sport', 'Football, lutte, basket, athlétisme : champions, compétitions et records.', [10, 20], true],
            ['Le face-à-face', 'Duel entre deux joueurs, un de chaque équipe. Le plus rapide marque, l’erreur coûte des points.', [40], true],
            ['Question banco', 'Question finale à forte valeur : l’équipe choisit de la jouer ou non, et risque autant qu’elle peut gagner.', [50], true],
        ];

        $now = now();
        DB::table('rubric_presets')->insert(array_map(fn ($preset, $i) => [
            'name' => $preset[0],
            'description' => $preset[1],
            'points' => json_encode($preset[2]),
            'penalties' => $preset[3],
            'position' => $i,
            'created_at' => $now,
            'updated_at' => $now,
        ], $presets, array_keys($presets)));
    }

    public function down(): void
    {
        Schema::dropIfExists('rubric_presets');
        Schema::table('score_events', fn (Blueprint $table) => $table->dropConstrainedForeignId('rubric_id'));
        Schema::dropIfExists('competition_rubrics');
        Schema::table('competitions', fn (Blueprint $table) => $table->dropColumn('scoring'));
    }
};
