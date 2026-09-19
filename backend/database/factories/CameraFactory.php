<?php

namespace Database\Factories;

use App\Models\Camera;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;

/**
 * @extends Factory<Camera>
 */
class CameraFactory extends Factory
{
    protected $model = Camera::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'name' => $this->faker->words(3, true),
            'location' => $this->faker->boolean(80) ? $this->faker->streetAddress() : null,
            'rtsp_url' => $this->faker->boolean(80)
                ? sprintf(
                    'rtsp://%s:%d/stream',
                    $this->faker->ipv4(),
                    $this->faker->numberBetween(554, 8554)
                )
                : null,
            'ip_address' => $this->faker->boolean(80) ? $this->faker->ipv4() : null,
            'port' => $this->faker->boolean(80) ? $this->faker->numberBetween(1, 65535) : null,
            'latitude' => $this->faker->boolean(80) ? $this->faker->latitude() : null,
            'longitude' => $this->faker->boolean(80) ? $this->faker->longitude() : null,
            'resolution_width' => $this->faker->randomElement([1280, 1920, 2560, 3840]),
            'resolution_height' => $this->faker->randomElement([720, 1080, 1440, 2160]),
            'is_active' => true,
            'credential_enabled' => false,
            'last_seen_at' => $this->faker->boolean(70) ? now()->subMinutes($this->faker->numberBetween(1, 120)) : null,
        ];
    }

    /**
     * Configure machine credentials for camera authentication tests.
     */
    public function withCredentials(string $password = 'CameraPassword1!'): static
    {
        return $this->state(fn (): array => [
            'email' => fake()->unique()->safeEmail(),
            'password' => Hash::make($password),
            'credential_enabled' => true,
            'credential_rotated_at' => null,
        ]);
    }
}
