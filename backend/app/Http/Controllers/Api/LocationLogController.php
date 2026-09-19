<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\AuthorizesPatrolOwnership;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreLocationLogRequest;
use App\Http\Resources\LocationLogResource;
use App\Models\LocationLog;
use App\Services\LocationLogTimestampService;
use App\Services\PatrolBroadcastService;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Throwable;

class LocationLogController extends Controller
{
    use AuthorizesPatrolOwnership;

    /**
     * @return list<string>
     */
    protected function eagerRelations(): array
    {
        return ['user', 'patrolSession'];
    }

    public function index(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'patrol_session_id' => ['sometimes', 'uuid', 'exists:patrol_sessions,id'],
            'user_id' => ['sometimes', 'uuid', 'exists:users,id'],
            'per_page' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:100'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed.',
                'data' => ['errors' => $validator->errors()->toArray()],
            ], 422);
        }

        $validated = $validator->validated();
        $authUser = $request->user('api');

        if (! $this->isAdminOrSecurityOperator($authUser) && array_key_exists('patrol_session_id', $validated)) {
            $this->authorizePatrolSessionIdBelongsToUser($validated['patrol_session_id']);
        }

        try {
            $query = LocationLog::query()->with($this->eagerRelations());

            if (! $this->isAdminOrSecurityOperator($authUser)) {
                $query->where('user_id', $authUser?->getKey());

                if (array_key_exists('patrol_session_id', $validated)) {
                    $query->where('patrol_session_id', $validated['patrol_session_id']);
                }
            } else {
                if (array_key_exists('patrol_session_id', $validated)) {
                    $query->where('patrol_session_id', $validated['patrol_session_id']);
                }

                if (array_key_exists('user_id', $validated)) {
                    $query->where('user_id', $validated['user_id']);
                }
            }

            $query->orderBy('timestamp', 'asc');

            $locationLogs = $query
                ->paginate($validated['per_page'] ?? 15)
                ->withQueryString();

            $payload = LocationLogResource::collection($locationLogs)->response()->getData(true);

            return response()->json([
                'success' => true,
                'message' => 'Location logs retrieved successfully.',
                'data' => $payload,
            ], 200);
        } catch (Throwable $e) {
            return $this->errorResponse($e);
        }
    }

    public function store(
        StoreLocationLogRequest $request,
        LocationLogTimestampService $timestampService,
        PatrolBroadcastService $broadcastService,
    ): JsonResponse {
        $data = $request->validated();
        $authUser = $request->user('api');
        $this->authorizePatrolSessionIdBelongsToUser($data['patrol_session_id']);

        if (! $this->isAdminOrSecurityOperator($authUser)) {
            $data['user_id'] = $authUser->getKey();
        }

        try {
            if (! isset($data['id']) || $data['id'] === null || $data['id'] === '') {
                $data['id'] = (string) Str::uuid();
            }

            $data['timestamp'] = $timestampService->normalizeForPatrolSession(
                $data['patrol_session_id'],
                (int) $data['timestamp'],
            );
            $data['server_received_at'] = now();

            $locationLog = LocationLog::query()->create($data);

            $locationLog->load($this->eagerRelations());
            $broadcastService->locationRecorded($locationLog);

            return response()->json([
                'success' => true,
                'message' => 'Location log created successfully.',
                'data' => (new LocationLogResource($locationLog))->resolve(),
            ], 201);
        } catch (Throwable $e) {
            return $this->errorResponse($e);
        }
    }

    public function show(LocationLog $locationLog): JsonResponse
    {
        $this->authorizeOwnLocationLog($locationLog);

        try {
            $locationLog->load($this->eagerRelations());

            return response()->json([
                'success' => true,
                'message' => 'Location log retrieved successfully.',
                'data' => (new LocationLogResource($locationLog))->resolve(),
            ], 200);
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
