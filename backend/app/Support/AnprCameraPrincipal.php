<?php

namespace App\Support;

use App\Models\AnprEvent;
use App\Models\Camera;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AnprCameraPrincipal
{
    public static function fromRequest(Request $request): ?Camera
    {
        $camera = $request->attributes->get('camera');

        return $camera instanceof Camera ? $camera : null;
    }

    public static function touchLastSeen(Camera $camera): void
    {
        $camera->forceFill(['last_seen_at' => now()])->save();
    }

    public static function forbiddenUnlessOwnsEvent(Camera $camera, AnprEvent $event): ?JsonResponse
    {
        if ((string) $event->camera_id !== (string) $camera->id) {
            return self::forbiddenResponse();
        }

        return null;
    }

    public static function forbiddenOnCameraIdMismatch(Camera $camera, ?string $bodyCameraId): ?JsonResponse
    {
        if ($bodyCameraId !== null && (string) $bodyCameraId !== (string) $camera->id) {
            return self::forbiddenResponse();
        }

        return null;
    }

    public static function forbiddenResponse(): JsonResponse
    {
        return response()->json([
            'success' => false,
            'message' => 'Forbidden.',
            'data' => null,
        ], 403);
    }
}
