<?php

namespace App\Http\Middleware;

use App\Models\Camera;
use App\Services\Auth\CameraAccessValidator;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use PHPOpenSourceSaver\JWTAuth\Exceptions\JWTException;
use Symfony\Component\HttpFoundation\Response;

class EnsureRequestIsAuthenticatedCamera
{
    public function __construct(
        private readonly CameraAccessValidator $cameraAccessValidator,
    ) {}

    /**
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        try {
            /** @var Camera|null $camera */
            $camera = Auth::guard('camera')->authenticate();
        } catch (JWTException) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthenticated.',
                'data' => null,
            ], 401);
        }

        if ($camera === null) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthenticated.',
                'data' => null,
            ], 401);
        }

        $payload = Auth::guard('camera')->payload();
        if (($payload['principal_type'] ?? null) !== Camera::PRINCIPAL_TYPE) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthenticated.',
                'data' => null,
            ], 401);
        }

        $denied = $this->cameraAccessValidator->ensureCameraAccessAllowed($camera);
        if ($denied !== null) {
            return $denied;
        }

        $request->attributes->set('camera', $camera->fresh());

        return $next($request);
    }
}
