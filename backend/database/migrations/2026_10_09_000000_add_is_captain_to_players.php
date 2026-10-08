<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Chaque équipe a un capitaine : les équipes existantes reçoivent leur premier joueur comme capitaine. */
    public function up(): void
    {
        Schema::table('players', fn (Blueprint $table) => $table->boolean('is_captain')->default(false)->after('position'));

        DB::table('players')->select('team_id')->distinct()->pluck('team_id')->each(function ($teamId) {
            $first = DB::table('players')->where('team_id', $teamId)->orderBy('position')->orderBy('id')->value('id');
            DB::table('players')->where('id', $first)->update(['is_captain' => true]);
        });
    }

    public function down(): void
    {
        Schema::table('players', fn (Blueprint $table) => $table->dropColumn('is_captain'));
    }
};
