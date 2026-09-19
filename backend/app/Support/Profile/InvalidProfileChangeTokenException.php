<?php

namespace App\Support\Profile;

use RuntimeException;

class InvalidProfileChangeTokenException extends RuntimeException
{
    public const MESSAGE = 'Invalid profile change token.';

    public function __construct()
    {
        parent::__construct(self::MESSAGE);
    }
}
