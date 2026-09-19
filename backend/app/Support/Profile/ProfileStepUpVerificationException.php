<?php

namespace App\Support\Profile;

use RuntimeException;

class ProfileStepUpVerificationException extends RuntimeException
{
    public const MESSAGE = 'Step-up verification failed.';

    public function __construct()
    {
        parent::__construct(self::MESSAGE);
    }
}
