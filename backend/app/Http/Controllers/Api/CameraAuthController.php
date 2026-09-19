<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\CameraLoginRequest;
use App\Models\Camera;
use App\Support\AnprCameraPrincipal;
use App\Services\Auth\CameraAccessDisabledException;
use App\Services\Auth\CameraAuthService;
use App\Services\Auth\InvalidCameraCredentialsException;
use App\Services\Auth\LoginRateLimitedException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Throwable;

class CameraAuthController extends Controller
{
    public function __construct(
        private readonly CameraAuthService $cameraAuthService,
    ) {}

    public function login(CameraLoginRequest $request): JsonResponse
    {
        try {
            $validated = $request->validated();

            $data = $this->cameraAuthService->login(
                $validated['email'],
                $validated['password'],
                $validated['rtsp_url'] ?? null,
                $request,
            );

            return response()->json([
                'success' => true,
                'message' => 'Camera authenticated successfully.',
                'data' => $data,
            ], 200);
        } catch (LoginRateLimitedException $exception) {
            return response()->json([
                'success' => false,
                'message' => 'Too many attempts. Try again later.',
                'data' => ['retry_after_seconds' => $exception->retryAfterSeconds],
            ], 429);
        } catch (InvalidCameraCredentialsException) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid credentials.',
                'data' => null,
            ], 401);
        } catch (CameraAccessDisabledException) {
            return response()->json([
                'success' => false,
                'message' => 'Camera access is disabled.',
                'data' => null,
            ], 403);
        } catch (Throwable $e) {
            report($e);

            $message = config('app.debug')
                ? $e->getMessage()
                : 'An unexpected error occurred.';

            return response()->json([
                'success' => false,
                'message' => $message,
                'data' => null,
            ], 500);
        }
    }

    /**
     * Camera activity heartbeat. Updates last_seen_at only; does not create ANPR events.
     */
    public function heartbeat(Request $request): JsonResponse
    {
        /** @var Camera $camera */
        $camera = $request->attributes->get('camera');

        AnprCameraPrincipal::touchLastSeen($camera);

        return response()->json([
            'success' => true,
            'message' => 'Camera heartbeat acknowledged.',
            'data' => [
                'camera_id' => $camera->id,
                'last_seen_at' => $camera->fresh()->last_seen_at?->toIso8601String(),
            ],
        ], 200);
    }
}
