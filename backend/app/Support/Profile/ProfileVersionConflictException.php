<?php

namespace App\Support\Profile;

use App\Models\User;

class ProfileVersionConflictException extends \RuntimeException
{
    public function __construct(
        public readonly User $user,
        public readonly int $submittedVersion,
        public readonly int $currentVersion,
    ) {
        parent::__construct('Profile version conflict.');
    }
}
