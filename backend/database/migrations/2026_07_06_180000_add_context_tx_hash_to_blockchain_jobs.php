<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('blockchain_jobs', function (Blueprint $table) {
            // Stores the tx_hash that was current when this refresh job was scheduled.
            // Allows attempt counting to be scoped per-transaction, so that a new
            // retry_anchor with a new tx_hash starts refresh attempts from 1, not from
            // the count of old failed refresh jobs for the previous tx_hash.
            $table->string('context_tx_hash', 66)->nullable()->after('last_error');
            $table->index('context_tx_hash');
        });
    }

    public function down(): void
    {
        Schema::table('blockchain_jobs', function (Blueprint $table) {
            $table->dropIndex(['context_tx_hash']);
            $table->dropColumn('context_tx_hash');
        });
    }
};
