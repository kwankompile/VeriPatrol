<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('blockchain_records', function (Blueprint $table) {
            $table->dropUnique('blockchain_records_entity_proof_env_unique');
            $table->unique(
                ['entity_type', 'entity_id', 'proof_type', 'canonical_version', 'environment', 'record_hash'],
                'blockchain_records_entity_proof_env_hash_unique'
            );
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('blockchain_records', function (Blueprint $table) {
            $table->dropUnique('blockchain_records_entity_proof_env_hash_unique');
            $table->unique(
                ['entity_type', 'entity_id', 'proof_type', 'canonical_version', 'environment'],
                'blockchain_records_entity_proof_env_unique'
            );
        });
    }
};
