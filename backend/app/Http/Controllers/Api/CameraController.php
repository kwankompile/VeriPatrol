<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreCameraRequest;
use App\Http\Requests\UpdateCameraRequest;
use App\Http\Resources\CameraResource;
use App\Models\Camera;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Hash;
use Throwable;

class CameraController extends Controller
{
    public function index(): JsonResponse
    {
        try {
            return response()->json([
                'success' => true,
                'message' => 'Cameras retrieved successfully.',
                'data' => CameraResource::collection(Camera::query()->latest()->get()),
            ], 200);
        } catch (Throwable $e) {
            return $this->errorResponse($e);
        }
    }

    public function store(StoreCameraRequest $request): JsonResponse
    {
        try {
            $data = $request->validated();
            $data['password'] = Hash::make($data['password']);
            $data['credential_rotated_at'] = now();

            $camera = Camera::query()->create($data);

            return response()->json([
                'success' => true,
                'message' => 'Camera created successfully.',
                'data' => new CameraResource($camera),
            ], 201);
        } catch (Throwable $e) {
            return $this->errorResponse($e);
        }
    }

    public function show(Camera $camera): JsonResponse
    {
        try {
            return response()->json([
                'success' => true,
                'message' => 'Camera retrieved successfully.',
                'data' => new CameraResource($camera),
            ], 200);
        } catch (Throwable $e) {
            return $this->errorResponse($e);
        }
    }

    public function update(UpdateCameraRequest $request, Camera $camera): JsonResponse
    {
        try {
            $data = $request->validated();

            if (array_key_exists('password', $data)) {
                $data['password'] = Hash::make($data['password']);
                $data['credential_rotated_at'] = now();
            }

            $camera->update($data);

            return response()->json([
                'success' => true,
                'message' => 'Camera updated successfully.',
                'data' => new CameraResource($camera->fresh()),
            ], 200);
        } catch (Throwable $e) {
            return $this->errorResponse($e);
        }
    }

    public function destroy(Camera $camera): JsonResponse|Response
    {
        try {
            $camera->delete();

            return response()->noContent();
        } catch (Throwable $e) {
            return $this->errorResponse($e);
        }
    }

    protected function errorResponse(Throwable $e): JsonResponse
    {
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
