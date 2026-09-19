<?php

use App\Http\Controllers\Api\AnprEventController;
use App\Http\Controllers\Api\AnprEventLogController;
use App\Http\Controllers\Api\AnprImageController;
use App\Http\Controllers\Api\AuthAuditLogController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\AuthSessionController;
use App\Http\Controllers\Api\BlockchainRecordController;
use App\Http\Controllers\Api\CameraAuthController;
use App\Http\Controllers\Api\CameraController;
use App\Http\Controllers\Api\CheckpointController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\CheckpointEventController;
use App\Http\Controllers\Api\CheckpointEventMetricController;
use App\Http\Controllers\Api\LocationLogController;
use App\Http\Controllers\Api\PatrolRouteController;
use App\Http\Controllers\Api\PatrolSessionController;
use App\Http\Controllers\Api\ProfileController;
use App\Http\Controllers\Api\PushNotificationController;
use App\Http\Controllers\Api\PushSubscriptionController;
use App\Http\Controllers\Api\PwaSyncController;
use App\Http\Controllers\Api\RoleController;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Api\VehicleController;
use App\Http\Controllers\Api\ZoneController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Broadcast;
use Illuminate\Support\Facades\Route;

Route::post('auth/login', [AuthController::class, 'login']);
Route::post('auth/refresh', [AuthController::class, 'refresh']);
Route::post('auth/logout', [AuthController::class, 'logout']);
Route::post('auth/password-setup/complete', [AuthController::class, 'completePasswordSetup']);
Route::post('auth/2fa/setup/start', [AuthController::class, 'startTwoFactorSetup']);
Route::post('auth/2fa/setup/verify', [AuthController::class, 'verifyTwoFactorSetup']);
Route::post('auth/otp/verify', [AuthController::class, 'verifyOtp']);

Route::post('camera-auth/login', [CameraAuthController::class, 'login']);

Route::middleware('auth.camera')->group(function (): void {
    Route::post('camera-auth/heartbeat', [CameraAuthController::class, 'heartbeat']);
    Route::get('camera-auth/heartbeat', [CameraAuthController::class, 'heartbeat']);
});

Route::middleware('auth.anpr-write')->group(function (): void {
    Route::post('anpr-events', [AnprEventController::class, 'store'])->name('anpr-events.store');
    Route::post('anpr-events/{anpr_event}/images/upload', [AnprImageController::class, 'uploadForEvent'])
        ->name('anpr-events.images.upload');
    Route::post('anpr-event-logs', [AnprEventLogController::class, 'store'])->name('anpr-event-logs.store');
    Route::post('anpr-images', [AnprImageController::class, 'store'])->name('anpr-images.store');
});

Route::middleware(['auth:api', 'active.user'])->group(function (): void {
    Route::post('broadcasting/auth', function (Request $request) {
        return Broadcast::auth($request);
    });

    Route::get('auth/me', [AuthController::class, 'me']);
    Route::get('dashboard/summary', [DashboardController::class, 'summary'])
        ->name('dashboard.summary');
    Route::get('profile', [ProfileController::class, 'show'])->name('profile.show');
    Route::patch('profile', [ProfileController::class, 'update'])->name('profile.update');
    Route::post('profile/picture', [ProfileController::class, 'uploadPicture'])->name('profile.picture.upload');
    Route::delete('profile/picture', [ProfileController::class, 'deletePicture'])->name('profile.picture.delete');
    Route::post('profile/password/change', [ProfileController::class, 'changePassword'])->name('profile.password.change');
    Route::post('profile/email/start', [ProfileController::class, 'startEmailChange'])->name('profile.email.start');
    Route::post('profile/email/confirm', [ProfileController::class, 'confirmEmailChange'])->name('profile.email.confirm');
    Route::post('profile/2fa/reconfigure/start', [ProfileController::class, 'startTwoFactorReconfigure'])->name('profile.2fa.reconfigure.start');
    Route::post('profile/2fa/reconfigure/verify', [ProfileController::class, 'verifyTwoFactorReconfigure'])->name('profile.2fa.reconfigure.verify');
    Route::post('auth/logout-all', [AuthSessionController::class, 'logoutAll']);
    Route::get('auth/sessions', [AuthSessionController::class, 'index']);
    Route::delete('auth/sessions/{session}', [AuthSessionController::class, 'destroy']);

    // Guard-owned: restore the authenticated user's in-progress patrol after reload/navigation.
    // Registered before the monitoring `patrol-sessions/{patrol_session}` route so the literal
    // `active` segment is matched instead of being bound as a session id.
    Route::get('patrol-sessions/active', [PatrolSessionController::class, 'active'])
        ->name('patrol-sessions.active');

    Route::middleware('patrol.monitoring')->group(function (): void {
        Route::get('patrol-sessions', [PatrolSessionController::class, 'index'])
            ->name('patrol-sessions.index');
        Route::get('patrol-sessions/{patrol_session}', [PatrolSessionController::class, 'show'])
            ->name('patrol-sessions.show');

        Route::get('patrol-routes', [PatrolRouteController::class, 'index'])
            ->name('patrol-routes.index');

        Route::get('checkpoint-events', [CheckpointEventController::class, 'index'])
            ->name('checkpoint-events.index');

        Route::get('anpr-events', [AnprEventController::class, 'index'])
            ->name('anpr-events.index');
        Route::get('anpr-events/{anpr_event}', [AnprEventController::class, 'show'])
            ->name('anpr-events.show');
        Route::get('anpr-event-logs', [AnprEventLogController::class, 'index'])
            ->name('anpr-event-logs.index');
        Route::get('anpr-event-logs/{anpr_event_log}', [AnprEventLogController::class, 'show'])
            ->name('anpr-event-logs.show');
        Route::get('anpr-images/{anpr_image}/file', [AnprImageController::class, 'file'])
            ->name('anpr-images.file');
        Route::get('anpr-images', [AnprImageController::class, 'index'])
            ->name('anpr-images.index');
        Route::get('anpr-images/{anpr_image}', [AnprImageController::class, 'show'])
            ->name('anpr-images.show');
    });

    Route::middleware('admin')->group(function (): void {
        Route::get('auth/audit-logs', [AuthAuditLogController::class, 'index']);
        Route::post('auth/2fa/reset/{user}', [AuthController::class, 'resetTwoFactor']);
        Route::get('blockchain-records/summary', [BlockchainRecordController::class, 'summary'])
            ->name('blockchain-records.summary');
        Route::get('blockchain-records', [BlockchainRecordController::class, 'index'])
            ->name('blockchain-records.index');
        Route::post('blockchain-records/verify-all', [BlockchainRecordController::class, 'verifyAll'])
            ->name('blockchain-records.verify-all');
        Route::get('blockchain-records/{blockchain_record}', [BlockchainRecordController::class, 'show'])
            ->name('blockchain-records.show');
        Route::post('blockchain-records/{blockchain_record}/verify', [BlockchainRecordController::class, 'verify'])
            ->name('blockchain-records.verify');
        Route::post('blockchain-records/{blockchain_record}/refresh', [BlockchainRecordController::class, 'refresh'])
            ->name('blockchain-records.refresh');
        Route::post('blockchain-records/{blockchain_record}/retry', [BlockchainRecordController::class, 'retry'])
            ->name('blockchain-records.retry');
        Route::apiResource('roles', RoleController::class)->only(['index', 'show']);
        Route::apiResource('users', UserController::class);
        Route::post('users/{user}/restore', [UserController::class, 'restore']);
        Route::apiResource('vehicles', VehicleController::class);
        Route::apiResource('cameras', CameraController::class);

        Route::post('zones', [ZoneController::class, 'store'])->name('zones.store');
        Route::put('zones/{zone}', [ZoneController::class, 'update'])->name('zones.update');
        Route::patch('zones/{zone}', [ZoneController::class, 'update']);
        Route::delete('zones/{zone}', [ZoneController::class, 'destroy'])->name('zones.destroy');

        Route::post('checkpoints', [CheckpointController::class, 'store'])->name('checkpoints.store');
        Route::put('checkpoints/{checkpoint}', [CheckpointController::class, 'update'])->name('checkpoints.update');
        Route::patch('checkpoints/{checkpoint}', [CheckpointController::class, 'update']);
        Route::delete('checkpoints/{checkpoint}', [CheckpointController::class, 'destroy'])->name('checkpoints.destroy');

        Route::put('anpr-events/{anpr_event}', [AnprEventController::class, 'update'])->name('anpr-events.update');
        Route::patch('anpr-events/{anpr_event}', [AnprEventController::class, 'update']);
        Route::delete('anpr-events/{anpr_event}', [AnprEventController::class, 'destroy'])->name('anpr-events.destroy');
        Route::put('anpr-event-logs/{anpr_event_log}', [AnprEventLogController::class, 'update'])->name('anpr-event-logs.update');
        Route::patch('anpr-event-logs/{anpr_event_log}', [AnprEventLogController::class, 'update']);
        Route::delete('anpr-event-logs/{anpr_event_log}', [AnprEventLogController::class, 'destroy'])->name('anpr-event-logs.destroy');
        Route::put('anpr-images/{anpr_image}', [AnprImageController::class, 'update'])->name('anpr-images.update');
        Route::patch('anpr-images/{anpr_image}', [AnprImageController::class, 'update']);
        Route::delete('anpr-images/{anpr_image}', [AnprImageController::class, 'destroy'])->name('anpr-images.destroy');
    });

    Route::get('zones', [ZoneController::class, 'index'])->name('zones.index');
    Route::get('zones/{zone}', [ZoneController::class, 'show'])->name('zones.show');
    Route::get('checkpoints', [CheckpointController::class, 'index'])->name('checkpoints.index');
    Route::get('checkpoints/{checkpoint}', [CheckpointController::class, 'show'])->name('checkpoints.show');

    Route::get('patrol-sessions/{patrol_session}/summary', [PatrolSessionController::class, 'summary'])
        ->name('patrol-sessions.summary');
    Route::post('patrol-sessions/{patrol_session}/validate', [PatrolSessionController::class, 'validateSession'])
        ->name('patrol-sessions.validate');
    Route::post('patrol-sessions', [PatrolSessionController::class, 'store'])->name('patrol-sessions.store');
    Route::put('patrol-sessions/{patrol_session}', [PatrolSessionController::class, 'update'])->name('patrol-sessions.update');
    Route::patch('patrol-sessions/{patrol_session}', [PatrolSessionController::class, 'update']);
    Route::delete('patrol-sessions/{patrol_session}', [PatrolSessionController::class, 'destroy'])->name('patrol-sessions.destroy');

    Route::post('patrol-routes', [PatrolRouteController::class, 'store'])->name('patrol-routes.store');

    Route::post('checkpoint-events', [CheckpointEventController::class, 'store'])->name('checkpoint-events.store');
    Route::get('checkpoint-events/{checkpoint_event}', [CheckpointEventController::class, 'show'])->name('checkpoint-events.show');
    Route::put('checkpoint-events/{checkpoint_event}', [CheckpointEventController::class, 'update'])->name('checkpoint-events.update');
    Route::patch('checkpoint-events/{checkpoint_event}', [CheckpointEventController::class, 'update']);
    Route::delete('checkpoint-events/{checkpoint_event}', [CheckpointEventController::class, 'destroy'])->name('checkpoint-events.destroy');

    Route::apiResource('checkpoint-event-metrics', CheckpointEventMetricController::class);
    Route::apiResource('location-logs', LocationLogController::class)
        ->only(['index', 'store', 'show']);
    Route::post('pwa/sync', [PwaSyncController::class, 'sync']);
    Route::post('push-subscriptions', [PushSubscriptionController::class, 'store']);
    Route::delete('push-subscriptions/{push_subscription}', [PushSubscriptionController::class, 'destroy']);
    Route::post('push-notifications/test', [PushNotificationController::class, 'test']);
});
