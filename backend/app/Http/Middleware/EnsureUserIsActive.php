<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

class EnsureUserIsActive
{
    /**
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $authenticated = $request->user('api');

        if ($authenticated === null) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthenticated.',
                'data' => null,
            ], 401);
        }

        if ($this->isNonUserPrincipalToken($request)) {
            return response()->json([
                'success' => false,
                'message' => 'Forbidden.',
                'data' => null,
            ], 403);
        }

        $user = User::withTrashed()->find($authenticated->getKey());

        if ($user === null || $user->trashed()) {
            return response()->json([
                'success' => false,
                'message' => 'Forbidden.',
                'data' => null,
            ], 403);
        }

        if ($user->setup_required === true) {
            return response()->json([
                'success' => false,
                'message' => 'Forbidden.',
                'data' => null,
            ], 403);
        }

        if ($user->two_factor_enabled !== true) {
            return response()->json([
                'success' => false,
                'message' => 'Forbidden.',
                'data' => null,
            ], 403);
        }

        if ($this->accessTokenIssuedBeforeSecurityChange($user)) {
            return response()->json([
                'success' => false,
                'message' => 'Forbidden.',
                'data' => null,
            ], 403);
        }

        return $next($request);
    }

    private function isNonUserPrincipalToken(Request $request): bool
    {
        if ($request->bearerToken() === null) {
            return false;
        }

        try {
            $principalType = auth('api')->payload()->get('principal_type');
        } catch (Throwable) {
            return false;
        }

        if ($principalType === null) {
            return false;
        }

        return $principalType !== User::PRINCIPAL_TYPE;
    }

    private function accessTokenIssuedBeforeSecurityChange(User $user): bool
    {
        $invalidationAt = $this->securityInvalidationTimestamp($user);

        if ($invalidationAt === null) {
            return false;
        }

        try {
            $iat = auth('api')->payload()->get('iat');
        } catch (Throwable) {
            return true;
        }

        if (! is_numeric($iat)) {
            return true;
        }

        return (int) $iat <= $invalidationAt->getTimestamp();
    }

    private function securityInvalidationTimestamp(User $user): ?\Illuminate\Support\Carbon
    {
        $timestamps = array_filter([
            $user->last_password_changed_at,
            $user->last_security_changed_at,
        ]);

        if ($timestamps === []) {
            return null;
        }

        return collect($timestamps)->max();
    }
}
