<?php

use App\Models\Game;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Code court pour regarder un match directement (spectateurs). */
    public function up(): void
    {
        Schema::table('games', fn (Blueprint $table) => $table->string('watch_code', 5)->nullable()->unique()->after('uses_buzzer'));

        DB::table('games')->whereNull('watch_code')->pluck('id')->each(
            fn ($id) => DB::table('games')->where('id', $id)->update(['watch_code' => Game::newWatchCode()]),
        );
    }

    public function down(): void
    {
        Schema::table('games', fn (Blueprint $table) => $table->dropColumn('watch_code'));
    }
};
