<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * M8 status model: verified, partial, needs_review, suspicious, missed (+ pending).
     * Maps uncertain → needs_review, rejected → missed.
     */
    public function up(): void
    {
        $driver = Schema::getConnection()->getDriverName();

        if ($driver === 'mysql') {
            DB::statement(
                "ALTER TABLE checkpoint_events MODIFY status ENUM(
                    'pending','verified','suspicious','uncertain','rejected',
                    'partial','needs_review','missed'
                ) NOT NULL DEFAULT 'pending'"
            );
        }

        DB::table('checkpoint_events')->where('status', 'uncertain')->update(['status' => 'needs_review']);
        DB::table('checkpoint_events')->where('status', 'rejected')->update(['status' => 'missed']);

        if ($driver === 'mysql') {
            DB::statement(
                "ALTER TABLE checkpoint_events MODIFY status ENUM(
                    'pending','verified','partial','needs_review','suspicious','missed'
                ) NOT NULL DEFAULT 'pending'"
            );
        }
    }

    public function down(): void
    {
        $driver = Schema::getConnection()->getDriverName();

        if ($driver === 'mysql') {
            DB::statement(
                "ALTER TABLE checkpoint_events MODIFY status ENUM(
                    'pending','verified','partial','needs_review','suspicious','missed',
                    'uncertain','rejected'
                ) NOT NULL DEFAULT 'pending'"
            );
        }

        DB::table('checkpoint_events')->where('status', 'needs_review')->update(['status' => 'uncertain']);
        DB::table('checkpoint_events')->where('status', 'missed')->update(['status' => 'rejected']);
        DB::table('checkpoint_events')->where('status', 'partial')->update(['status' => 'uncertain']);

        if ($driver === 'mysql') {
            DB::statement(
                "ALTER TABLE checkpoint_events MODIFY status ENUM(
                    'pending','verified','suspicious','uncertain','rejected'
                ) NOT NULL DEFAULT 'pending'"
            );
        }
    }
};
