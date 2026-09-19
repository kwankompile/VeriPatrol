<?php

namespace App\Support\Profile;

use RuntimeException;

class ProfileTwoFactorReconfigureVerificationException extends RuntimeException
{
    public const MESSAGE = 'Two-factor reconfiguration verification failed.';

    public function __construct()
    {
        parent::__construct(self::MESSAGE);
    }
}
