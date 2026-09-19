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
        Schema::table('cameras', function (Blueprint $table): void {
            $table->string('email')->nullable()->unique()->after('name');
            $table->boolean('credential_enabled')->default(false)->after('password');
            $table->timestamp('credential_rotated_at')->nullable()->after('credential_enabled');
            $table->timestamp('last_login_at')->nullable()->after('credential_rotated_at');
            $table->timestamp('rtsp_reported_at')->nullable()->after('rtsp_url');
        });

        Schema::table('cameras', function (Blueprint $table): void {
            $table->text('rtsp_url')->nullable()->change();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('cameras', function (Blueprint $table): void {
            $table->dropColumn([
                'email',
                'credential_enabled',
                'last_login_at',
                'rtsp_reported_at',
                'credential_rotated_at',
            ]);
        });

        Schema::table('cameras', function (Blueprint $table): void {
            $table->text('rtsp_url')->nullable(false)->change();
        });
    }
};
