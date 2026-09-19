<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Profile\ChangePasswordRequest;
use App\Http\Requests\Profile\ConfirmEmailChangeRequest;
use App\Http\Requests\Profile\StartEmailChangeRequest;
use App\Http\Requests\Profile\StartTwoFactorReconfigureRequest;
use App\Http\Requests\Profile\UpdateProfileRequest;
use App\Http\Requests\Profile\UploadProfilePictureRequest;
use App\Http\Requests\Profile\VerifyTwoFactorReconfigureRequest;
use App\Http\Resources\ProfileResource;
use App\Models\User;
use App\Services\Auth\RefreshTokenService;
use App\Services\Profile\ProfileEmailService;
use App\Services\Profile\ProfilePasswordService;
use App\Services\Profile\ProfilePictureService;
use App\Services\Profile\ProfileService;
use App\Services\Profile\ProfileTwoFactorReconfigureService;
use App\Support\Profile\InvalidProfileChangeTokenException;
use App\Support\Profile\ProfileStepUpRateLimitedException;
use App\Support\Profile\ProfileStepUpVerificationException;
use App\Support\Profile\ProfileTwoFactorReconfigureVerificationException;
use App\Support\Profile\ProfileVersionConflictException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProfileController extends Controller
{
    public function __construct(
        private readonly ProfileService $profileService,
        private readonly ProfilePictureService $profilePictureService,
        private readonly ProfilePasswordService $profilePasswordService,
        private readonly ProfileEmailService $profileEmailService,
        private readonly ProfileTwoFactorReconfigureService $profileTwoFactorReconfigureService,
        private readonly RefreshTokenService $refreshTokenService,
    ) {}

    public function show(Request $request): JsonResponse
    {
        $user = $this->authenticatedUser($request);

        if ($user === null) {
            return $this->unauthenticatedResponse();
        }

        $user->loadMissing('role');

        return response()->json([
            'success' => true,
            'message' => 'Profile retrieved successfully.',
            'data' => [
                'user' => (new ProfileResource($user))->resolve(),
            ],
        ]);
    }

    public function update(UpdateProfileRequest $request): JsonResponse
    {
        $user = $this->authenticatedUser($request);

        if ($user === null) {
            return $this->unauthenticatedResponse();
        }

        try {
            $updated = $this->profileService->updateProfile(
                $user,
                $request->validated(),
                $request,
            );
        } catch (ProfileVersionConflictException $exception) {
            return response()->json([
                'success' => false,
                'message' => 'Profile has been modified. Please refresh and try again.',
                'data' => [
                    'code' => 'profile_version_conflict',
                    'current_profile_version' => $exception->currentVersion,
                    'user' => (new ProfileResource($exception->user))->resolve(),
                ],
            ], 409);
        }

        return response()->json([
            'success' => true,
            'message' => 'Profile updated successfully.',
            'data' => [
                'user' => (new ProfileResource($updated))->resolve(),
            ],
        ]);
    }

    public function uploadPicture(UploadProfilePictureRequest $request): JsonResponse
    {
        $user = $this->authenticatedUser($request);

        if ($user === null) {
            return $this->unauthenticatedResponse();
        }

        $updated = $this->profilePictureService->uploadPicture(
            $user,
            $request->file('image'),
            $request,
        );

        return response()->json([
            'success' => true,
            'message' => 'Profile picture uploaded successfully.',
            'data' => [
                'user' => (new ProfileResource($updated))->resolve(),
            ],
        ]);
    }

    public function deletePicture(Request $request): JsonResponse
    {
        $user = $this->authenticatedUser($request);

        if ($user === null) {
            return $this->unauthenticatedResponse();
        }

        $result = $this->profilePictureService->deletePicture($user, $request);

        return response()->json([
            'success' => true,
            'message' => 'Profile picture removed successfully.',
            'data' => [
                'user' => (new ProfileResource($result['user']))->resolve(),
            ],
        ]);
    }

    public function changePassword(ChangePasswordRequest $request): JsonResponse
    {
        $user = $this->authenticatedUser($request);

        if ($user === null) {
            return $this->unauthenticatedResponse();
        }

        try {
            $result = $this->profilePasswordService->changePassword(
                $user,
                $request->validated(),
                $request,
            );
        } catch (ProfileStepUpRateLimitedException $exception) {
            return response()->json([
                'success' => false,
                'message' => 'Too many step-up verification attempts.',
                'data' => [
                    'retry_after_seconds' => $exception->retryAfterSeconds,
                ],
            ], 429);
        } catch (ProfileStepUpVerificationException) {
            return response()->json([
                'success' => false,
                'message' => ProfileStepUpVerificationException::MESSAGE,
                'data' => null,
            ], 422);
        }

        return response()->json([
            'success' => true,
            'message' => 'Password changed successfully. Please sign in again.',
            'data' => [
                'requires_reauthentication' => true,
                'revoked_sessions_count' => $result['revoked_count'],
            ],
        ])->withCookie($this->refreshTokenService->forgetCookie());
    }

    public function startEmailChange(StartEmailChangeRequest $request): JsonResponse
    {
        $user = $this->authenticatedUser($request);

        if ($user === null) {
            return $this->unauthenticatedResponse();
        }

        try {
            $result = $this->profileEmailService->startEmailChange(
                $user,
                $request->validated(),
                $request,
            );
        } catch (ProfileStepUpRateLimitedException $exception) {
            return response()->json([
                'success' => false,
                'message' => 'Too many step-up verification attempts.',
                'data' => [
                    'retry_after_seconds' => $exception->retryAfterSeconds,
                ],
            ], 429);
        } catch (ProfileStepUpVerificationException) {
            return response()->json([
                'success' => false,
                'message' => ProfileStepUpVerificationException::MESSAGE,
                'data' => null,
            ], 422);
        }

        return response()->json([
            'success' => true,
            'message' => 'Email change verification sent.',
            'data' => array_filter([
                'expires_in' => $result['expires_in'],
                'masked_email' => $result['masked_email'],
                'delivery_mode' => $result['delivery_mode'] ?? null,
            ], fn ($value) => $value !== null),
        ]);
    }

    public function confirmEmailChange(ConfirmEmailChangeRequest $request): JsonResponse
    {
        $user = $this->authenticatedUser($request);

        if ($user === null) {
            return $this->unauthenticatedResponse();
        }

        try {
            $result = $this->profileEmailService->confirmEmailChange(
                $user,
                $request->validated(),
                $request,
            );
        } catch (InvalidProfileChangeTokenException) {
            return response()->json([
                'success' => false,
                'message' => InvalidProfileChangeTokenException::MESSAGE,
                'data' => null,
            ], 422);
        } catch (ProfileStepUpRateLimitedException $exception) {
            return response()->json([
                'success' => false,
                'message' => 'Too many step-up verification attempts.',
                'data' => [
                    'retry_after_seconds' => $exception->retryAfterSeconds,
                ],
            ], 429);
        }

        return response()->json([
            'success' => true,
            'message' => 'Email changed successfully. Please sign in again.',
            'data' => [
                'requires_reauthentication' => true,
                'revoked_sessions_count' => $result['revoked_count'],
            ],
        ])->withCookie($this->refreshTokenService->forgetCookie());
    }

    public function startTwoFactorReconfigure(StartTwoFactorReconfigureRequest $request): JsonResponse
    {
        $user = $this->authenticatedUser($request);

        if ($user === null) {
            return $this->unauthenticatedResponse();
        }

        try {
            $result = $this->profileTwoFactorReconfigureService->startReconfigure(
                $user,
                $request->validated(),
                $request,
            );
        } catch (ProfileStepUpRateLimitedException $exception) {
            return response()->json([
                'success' => false,
                'message' => 'Too many step-up verification attempts.',
                'data' => [
                    'retry_after_seconds' => $exception->retryAfterSeconds,
                ],
            ], 429);
        } catch (ProfileStepUpVerificationException) {
            return response()->json([
                'success' => false,
                'message' => ProfileStepUpVerificationException::MESSAGE,
                'data' => null,
            ], 422);
        }

        return response()->json([
            'success' => true,
            'message' => 'Two-factor reconfiguration started.',
            'data' => [
                'two_factor_reconfigure_token' => $result['two_factor_reconfigure_token'],
                'manual_key' => $result['manual_key'],
                'otpauth_uri' => $result['otpauth_uri'],
                'expires_in' => $result['expires_in'],
            ],
        ]);
    }

    public function verifyTwoFactorReconfigure(VerifyTwoFactorReconfigureRequest $request): JsonResponse
    {
        $user = $this->authenticatedUser($request);

        if ($user === null) {
            return $this->unauthenticatedResponse();
        }

        try {
            $result = $this->profileTwoFactorReconfigureService->verifyReconfigure(
                $user,
                $request->validated(),
                $request,
            );
        } catch (ProfileStepUpRateLimitedException $exception) {
            return response()->json([
                'success' => false,
                'message' => 'Too many step-up verification attempts.',
                'data' => [
                    'retry_after_seconds' => $exception->retryAfterSeconds,
                ],
            ], 429);
        } catch (InvalidProfileChangeTokenException) {
            return response()->json([
                'success' => false,
                'message' => InvalidProfileChangeTokenException::MESSAGE,
                'data' => null,
            ], 422);
        } catch (ProfileTwoFactorReconfigureVerificationException) {
            return response()->json([
                'success' => false,
                'message' => ProfileTwoFactorReconfigureVerificationException::MESSAGE,
                'data' => null,
            ], 422);
        }

        return response()->json([
            'success' => true,
            'message' => 'Two-factor authentication reconfigured successfully. Please sign in again.',
            'data' => [
                'requires_reauthentication' => true,
                'revoked_sessions_count' => $result['revoked_count'],
            ],
        ])->withCookie($this->refreshTokenService->forgetCookie());
    }

    private function authenticatedUser(Request $request): ?User
    {
        $user = $request->user('api');

        return $user instanceof User ? $user : null;
    }

    private function unauthenticatedResponse(): JsonResponse
    {
        return response()->json([
            'success' => false,
            'message' => 'Unauthenticated.',
            'data' => null,
        ], 401);
    }
}
