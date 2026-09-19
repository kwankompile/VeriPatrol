<?php

namespace Database\Factories;

use App\Models\ProfileChangeToken;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ProfileChangeToken>
 */
class ProfileChangeTokenFactory extends Factory
{
    protected $model = ProfileChangeToken::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        $plainToken = bin2hex(random_bytes(32));

        return [
            'user_id' => User::factory(),
            'type' => ProfileChangeToken::TYPE_EMAIL_CHANGE,
            'token_hash' => ProfileChangeToken::hashToken($plainToken),
            'pending_payload' => null,
            'expires_at' => now()->addMinutes((int) config('profile.change_tokens.ttl_minutes', 10)),
            'used_at' => null,
            'ip_address' => fake()->ipv4(),
            'user_agent' => fake()->userAgent(),
        ];
    }

    public function emailChange(): static
    {
        return $this->state(fn (array $attributes) => [
            'type' => ProfileChangeToken::TYPE_EMAIL_CHANGE,
        ]);
    }

    public function twoFactorReconfigure(): static
    {
        return $this->state(fn (array $attributes) => [
            'type' => ProfileChangeToken::TYPE_TWO_FACTOR_RECONFIGURE,
        ]);
    }

    public function expired(): static
    {
        return $this->state(fn (array $attributes) => [
            'expires_at' => now()->subMinute(),
        ]);
    }

    public function used(): static
    {
        return $this->state(fn (array $attributes) => [
            'used_at' => now(),
        ]);
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    public function withPendingPayload(array $payload): static
    {
        return $this->state(fn (array $attributes) => [
            'pending_payload' => $payload,
        ]);
    }
}
