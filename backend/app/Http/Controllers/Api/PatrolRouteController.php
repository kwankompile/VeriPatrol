<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\AuthorizesPatrolMonitoring;
use App\Http\Controllers\Concerns\AuthorizesPatrolOwnership;
use App\Http\Controllers\Controller;
use App\Http\Requests\StorePatrolRouteRequest;
use App\Http\Resources\PatrolMovementPointResource;
use App\Http\Resources\PatrolRouteResource;
use App\Models\PatrolRoute;
use App\Services\PatrolBroadcastService;
use App\Services\PatrolMovementService;
use Carbon\Carbon;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Throwable;

class PatrolRouteController extends Controller
{
    use AuthorizesPatrolMonitoring;
    use AuthorizesPatrolOwnership;

    /**
     * List drawable patrol movement points.
     *
     * Canonical source: location_logs (via PatrolMovementService).
     * Temporary fallback: patrol_routes for legacy sessions with no usable location logs.
     */
    public function index(Request $request, PatrolMovementService $movementService): JsonResponse
    {
        $this->authorizePatrolMonitoring();

        try {
            $validator = Validator::make($request->all(), [
                'patrol_session_id' => ['sometimes', 'uuid', 'exists:patrol_sessions,id'],
                'per_page' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:1000'],
                'page' => ['sometimes', 'nullable', 'integer', 'min:1'],
            ]);

            if ($validator->fails()) {
                return response()->json([
                    'success' => false,
                    'message' => 'Validation failed.',
                    'data' => ['errors' => $validator->errors()->toArray()],
                ], 422);
            }

            $validated = $validator->validated();
            $sessionId = $validated['patrol_session_id'] ?? null;

            $query = $movementService->movementPointsQuery($sessionId);
            $query->with(['patrolSession']);

            $points = $query
                ->paginate($validated['per_page'] ?? 500)
                ->withQueryString();

            $payload = PatrolMovementPointResource::collection($points)->response()->getData(true);

            return response()->json([
                'success' => true,
                'message' => 'Patrol routes retrieved successfully.',
                'data' => $payload,
            ], 200);
        } catch (Throwable $e) {
            return $this->errorResponse($e);
        }
    }

    /**
     * @deprecated Prefer POST /api/location-logs or POST /api/pwa/sync.
     *             Retained for legacy clients only; new GPS samples must not dual-write here.
     */
    public function store(StorePatrolRouteRequest $request, PatrolBroadcastService $broadcastService): JsonResponse
    {
        $data = $request->validated();
        $this->authorizePatrolSessionIdBelongsToUser($data['patrol_session_id']);

        try {
            $recordedAt = $data['recorded_at'] ?? null;
            if ($recordedAt === null && isset($data['timestamp'])) {
                $recordedAt = Carbon::createFromTimestamp(((int) $data['timestamp']) / 1000);
            }

            $route = PatrolRoute::query()->create([
                'patrol_session_id' => $data['patrol_session_id'],
                'latitude' => $data['latitude'],
                'longitude' => $data['longitude'],
                'accuracy' => $data['accuracy'] ?? null,
                'altitude' => $data['altitude'] ?? null,
                'recorded_at' => $recordedAt ?? now(),
            ]);

            $route->load(['patrolSession']);
            $broadcastService->routeUpdated($route);

            return response()
                ->json([
                    'success' => true,
                    'message' => 'Patrol route point recorded successfully. Deprecated: use location_logs / pwa sync instead.',
                    'data' => (new PatrolRouteResource($route))->resolve(),
                    'deprecated' => true,
                    'successor' => [
                        'location_logs' => '/api/location-logs',
                        'pwa_sync' => '/api/pwa/sync',
                    ],
                ], 201)
                ->withHeaders([
                    'Deprecation' => 'true',
                    'Sunset' => 'Sat, 01 May 2027 00:00:00 GMT',
                    'Link' => '</api/pwa/sync>; rel="successor-version"',
                ]);
        } catch (Throwable $e) {
            return $this->errorResponse($e);
        }
    }

    protected function errorResponse(Throwable $e): JsonResponse
    {
        if ($e instanceof AuthorizationException) {
            throw $e;
        }

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
