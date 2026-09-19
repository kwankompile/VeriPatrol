<?php

namespace Tests\Concerns;

use App\Models\Camera;

trait AuthenticatesCameras
{
    private const DEFAULT_CAMERA_PASSWORD = 'CameraPassword1!';

    protected function createLoginReadyCamera(array $overrides = []): Camera
    {
        return Camera::factory()
            ->withCredentials(self::DEFAULT_CAMERA_PASSWORD)
            ->create(array_merge([
                'name' => 'Gate Camera 1',
                'credential_enabled' => true,
                'is_active' => true,
            ], $overrides));
    }

    protected function cameraAccessToken(?Camera $camera = null): string
    {
        $camera ??= $this->createLoginReadyCamera();

        $token = $this->postJson('/api/camera-auth/login', [
            'email' => $camera->email,
            'password' => self::DEFAULT_CAMERA_PASSWORD,
        ])->json('data.access_token');

        $this->assertIsString($token);
        $this->assertNotSame('', $token);

        return $token;
    }

    /**
     * @return array<string, mixed>
     */
    protected function cameraAnprEventPayload(array $overrides = []): array
    {
        return array_merge([
            'plate_number' => 'CAM-1234',
            'confidence' => 0.93,
            'detection_time' => now()->toIso8601String(),
            'is_valid' => true,
        ], $overrides);
    }

    protected function withCameraToken(string $token): static
    {
        return $this->withHeader('Authorization', 'Bearer '.$token);
    }
}
