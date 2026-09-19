<?php

use App\Support\LegacyCameraCredentialSanitizer;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        LegacyCameraCredentialSanitizer::sanitize();
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // Non-reversible data sanitization.
    }
};
