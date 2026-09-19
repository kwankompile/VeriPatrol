<?php

namespace App\Support\Profile;

use RuntimeException;

class ProfileStepUpRateLimitedException extends RuntimeException
{
    public function __construct(public readonly int $retryAfterSeconds)
    {
        parent::__construct('Too many step-up verification attempts.');
    }
}
