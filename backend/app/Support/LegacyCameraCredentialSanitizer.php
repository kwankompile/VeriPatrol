<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

class LegacyCameraCredentialSanitizer
{
    public static function isBcryptHash(?string $value): bool
    {
        if ($value === null || $value === '') {
            return false;
        }

        return (bool) preg_match('/^\$2[aby]\$\d{2}\$/', $value);
    }

    public static function sanitize(): void
    {
        DB::table('cameras')
            ->select(['id', 'password', 'email', 'credential_enabled'])
            ->orderBy('id')
            ->chunkById(100, function ($cameras): void {
                foreach ($cameras as $camera) {
                    $updates = [];

                    if ($camera->password !== null && ! self::isBcryptHash($camera->password)) {
                        $updates['password'] = null;
                        $updates['credential_enabled'] = false;
                    }

                    if ($camera->email === null && $camera->credential_enabled) {
                        $updates['credential_enabled'] = false;
                    }

                    if ($updates !== []) {
                        DB::table('cameras')->where('id', $camera->id)->update($updates);
                    }
                }
            }, 'id');
    }
}
