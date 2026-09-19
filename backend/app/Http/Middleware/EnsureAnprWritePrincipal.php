<?php

namespace App\Http\Middleware;

use App\Models\Camera;
use App\Services\Auth\CameraAccessValidator;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use PHPOpenSourceSaver\JWTAuth\Exceptions\JWTException;
use Symfony\Component\HttpFoundation\Response;

class EnsureAnprWritePrincipal
{
    public function __construct(
        private readonly CameraAccessValidator $cameraAccessValidator,
        private readonly EnsureUserIsActive $activeUserMiddleware,
        private readonly EnsureUserIsAdmin $adminMiddleware,
    ) {}

    /**
     * Accept camera JWT (machine) or active admin user JWT for ANPR write endpoints.
     *
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $cameraResult = $this->authenticateCamera($request);

        if ($cameraResult instanceof Response) {
            return $cameraResult;
        }

        if ($cameraResult === true) {
            return $next($request);
        }

        return $this->authenticateAdminUser($request, $next);
    }

    /**
     * @return true|Response|false
     */
    private function authenticateCamera(Request $request): bool|Response
    {
        if ($request->bearerToken() === null) {
            return false;
        }

        try {
            /** @var Camera|null $camera */
            $camera = Auth::guard('camera')->authenticate();
        } catch (JWTException) {
            return false;
        }

        if ($camera === null) {
            return false;
        }

        $payload = Auth::guard('camera')->payload();
        if (($payload['principal_type'] ?? null) !== Camera::PRINCIPAL_TYPE) {
            return false;
        }

        $denied = $this->cameraAccessValidator->ensureCameraAccessAllowed($camera);
        if ($denied !== null) {
            return $denied;
        }

        $request->attributes->set('camera', $camera->fresh());

        return true;
    }

    /**
     * @param  Closure(Request): (Response)  $next
     */
    private function authenticateAdminUser(Request $request, Closure $next): Response
    {
        if ($request->user('api') === null) {
            try {
                Auth::guard('api')->authenticate();
            } catch (JWTException) {
                return response()->json([
                    'success' => false,
                    'message' => 'Unauthenticated.',
                    'data' => null,
                ], 401);
            }
        }

        return $this->activeUserMiddleware->handle($request, function (Request $activeRequest) use ($next): Response {
            return $this->adminMiddleware->handle($activeRequest, $next);
        });
    }
}
