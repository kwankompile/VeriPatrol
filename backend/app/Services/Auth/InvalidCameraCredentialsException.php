<?php

namespace App\Services\Auth;

use Exception;

class InvalidCameraCredentialsException extends Exception
{
    public function __construct()
    {
        parent::__construct('Invalid credentials.');
    }
}
