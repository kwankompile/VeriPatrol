<?php

namespace App\Services\Auth;

use App\Models\Camera;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;
use Throwable;

class CameraAccessValidator
{
    public function ensureCameraAccessAllowed(Camera $camera, string $guard = 'camera'): ?JsonResponse
    {
        $camera = $camera->fresh();

        if ($camera === null || ! $camera->credential_enabled || ! $camera->is_active) {
            return response()->json([
                'success' => false,
                'message' => 'Camera access is disabled.',
                'data' => null,
            ], 403);
        }

        if ($this->accessTokenIssuedBeforeCredentialRotation($camera, $guard)) {
            return response()->json([
                'success' => false,
                'message' => 'Forbidden.',
                'data' => null,
            ], 403);
        }

        return null;
    }

    private function accessTokenIssuedBeforeCredentialRotation(Camera $camera, string $guard): bool
    {
        if ($camera->credential_rotated_at === null) {
            return false;
        }

        try {
            $iat = Auth::guard($guard)->payload()->get('iat');
        } catch (Throwable) {
            return true;
        }

        if (! is_numeric($iat)) {
            return true;
        }

        return (int) $iat < $camera->credential_rotated_at->getTimestamp();
    }
}
