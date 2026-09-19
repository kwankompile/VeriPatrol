<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\Dashboard\DashboardSummaryService;
use Illuminate\Http\JsonResponse;
use Throwable;

class DashboardController extends Controller
{
    public function __construct(
        private readonly DashboardSummaryService $dashboardSummaryService,
    ) {}

    public function summary(): JsonResponse
    {
        /** @var User|null $user */
        $user = auth('api')->user();

        if ($user === null) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthenticated.',
                'data' => null,
            ], 401);
        }

        try {
            $data = $this->dashboardSummaryService->buildForUser($user);

            return response()->json([
                'success' => true,
                'message' => 'Dashboard summary retrieved successfully.',
                'data' => $data,
            ]);
        } catch (Throwable $exception) {
            report($exception);

            return response()->json([
                'success' => false,
                'message' => 'Unable to load dashboard summary.',
                'data' => null,
            ], 500);
        }
    }
}
