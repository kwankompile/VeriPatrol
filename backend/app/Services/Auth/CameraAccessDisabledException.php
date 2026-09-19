<?php

namespace App\Services\Auth;

use Exception;

class CameraAccessDisabledException extends Exception
{
    public function __construct()
    {
        parent::__construct('Camera access is disabled.');
    }
}
