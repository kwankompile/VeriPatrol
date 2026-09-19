<?php

namespace Tests\Feature\Profile;

use App\Jobs\AnchorBlockchainRecordJob;
use App\Mail\ProfileEmailChangeVerificationMail;
use App\Models\BlockchainRecord;
use App\Models\ProfileChangeToken;
use App\Models\User;
use App\Services\Auth\TwoFactorService;
use App\Services\Blockchain\BlockchainHashService;
use App\Services\Blockchain\BlockchainRecordService;
use App\Services\Blockchain\BlockchainVerificationService;
use App\Services\Profile\ProfileBlockchainService;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Mail;
use Tests\Concerns\CreatesPatrolUsers;
use Tests\Concerns\EnablesTwoFactorAuth;
use Tests\TestCase;

class ProfileBlockchainIntegrationTest extends TestCase
{
    use CreatesPatrolUsers;
    use EnablesTwoFactorAuth;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RoleSeeder::class);
        Cache::flush();
        Mail::fake();

        config([
            'jwt.secret' => 'test-jwt-secret-key-for-auth-tests-32chars',
            'auth_security.access_token_ttl_minutes' => 30,
            'auth_security.refresh_cookie_name' => 'refresh_token',
            'auth_security.refresh_cookie_path' => '/api/auth',
            'auth_security.password_min_length' => 12,
            'profile.change_tokens.ttl_minutes' => 10,
            'profile.step_up.max_attempts' => 5,
            'profile.step_up.decay_seconds' => 300,
            'blockchain.enabled' => true,
            'blockchain.canonical_version' => 'v1',
            'blockchain.hash_algorithm' => 'sha256',
            'blockchain.network' => 'ganache',
            'blockchain.environment' => 'local',
            'blockchain.chain_id' => 1337,
            'blockchain.contract_address' => '0x'.str_repeat('a', 40),
        ]);
    }

    public function test_password_change_creates_user_profile_blockchain_record(): void
    {
        Bus::fake();

        $guard = $this->enableTwoFactor($this->guardUser());
        $this->loginWithOtp($guard);

        $this->changePassword($guard->fresh())->assertOk();

        $record = BlockchainRecord::query()
            ->where('entity_type', ProfileBlockchainService::ENTITY_TYPE)
            ->where('entity_id', $guard->id)
            ->where('proof_type', ProfileBlockchainService::PROOF_PASSWORD_CHANGED)
            ->first();

        $this->assertNotNull($record);
        $this->assertSame('queued', $record->status);
        $this->assertPayloadSummaryIsSafe($record->payload_summary);
        Bus::assertDispatched(AnchorBlockchainRecordJob::class);
    }

    public function test_email_confirmation_creates_user_profile_blockchain_record(): void
    {
        Bus::fake();

        $guard = $this->enableTwoFactor($this->guardUser());
        $this->startEmailChange($guard)->assertOk();
        $token = $this->plainTokenFromLastMail();

        $this->confirmEmailChange($guard->fresh(), $token)->assertOk();

        $record = BlockchainRecord::query()
            ->where('entity_type', ProfileBlockchainService::ENTITY_TYPE)
            ->where('entity_id', $guard->id)
            ->where('proof_type', ProfileBlockchainService::PROOF_EMAIL_CHANGED)
            ->first();

        $this->assertNotNull($record);
        $this->assertArrayHasKey('old_email_hash', $record->payload_summary);
        $this->assertArrayHasKey('new_email_hash', $record->payload_summary);
        $this->assertPayloadSummaryIsSafe($record->payload_summary);
        Bus::assertDispatched(AnchorBlockchainRecordJob::class);
    }

    public function test_email_change_start_does_not_create_blockchain_record(): void
    {
        Bus::fake();

        $guard = $this->enableTwoFactor($this->guardUser());

        $this->startEmailChange($guard)->assertOk();

        $this->assertSame(
            0,
            BlockchainRecord::query()->where('entity_type', ProfileBlockchainService::ENTITY_TYPE)->count()
        );
        Bus::assertNothingDispatched();
    }

    public function test_two_factor_reconfigure_verify_creates_user_profile_blockchain_record(): void
    {
        Bus::fake();

        $guard = $this->enableTwoFactor($this->guardUser());
        $start = $this->startReconfigure($guard)->assertOk()->json('data');
        $plainToken = $start['two_factor_reconfigure_token'];
        $newSecret = $start['manual_key'];
        $newOtp = app(TwoFactorService::class)->generateTotp($newSecret);

        $this->verifyReconfigure($guard->fresh(), $plainToken, $newOtp)->assertOk();

        $record = BlockchainRecord::query()
            ->where('entity_type', ProfileBlockchainService::ENTITY_TYPE)
            ->where('entity_id', $guard->id)
            ->where('proof_type', ProfileBlockchainService::PROOF_TWO_FACTOR_RECONFIGURED)
            ->first();

        $this->assertNotNull($record);
        $this->assertPayloadSummaryIsSafe($record->payload_summary);
        Bus::assertDispatched(AnchorBlockchainRecordJob::class);
    }

    public function test_two_factor_reconfigure_start_does_not_create_blockchain_record(): void
    {
        Bus::fake();

        $guard = $this->enableTwoFactor($this->guardUser());

        $this->startReconfigure($guard)->assertOk();

        $this->assertSame(
            0,
            BlockchainRecord::query()->where('entity_type', ProfileBlockchainService::ENTITY_TYPE)->count()
        );
        Bus::assertNothingDispatched();
    }

    public function test_api_response_does_not_require_confirmed_on_chain_status(): void
    {
        Bus::fake();

        $guard = $this->enableTwoFactor($this->guardUser());
        $this->loginWithOtp($guard);

        $response = $this->changePassword($guard->fresh());

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonMissingPath('data.blockchain_status')
            ->assertJsonMissingPath('data.blockchain_confirmed');

        $record = BlockchainRecord::query()
            ->where('entity_id', $guard->id)
            ->where('proof_type', ProfileBlockchainService::PROOF_PASSWORD_CHANGED)
            ->first();

        $this->assertNotNull($record);
        $this->assertNotSame('confirmed', $record->status);
    }

    public function test_repeated_sensitive_changes_create_separate_blockchain_records(): void
    {
        Bus::fake();

        $guard = $this->enableTwoFactor($this->guardUser());
        $service = app(ProfileBlockchainService::class);

        Carbon::setTestNow('2026-06-29T10:00:00Z');
        $first = $service->recordPasswordChanged($guard, 2, 1, request(), now());

        Carbon::setTestNow('2026-06-29T11:00:00Z');
        $second = $service->recordPasswordChanged($guard, 3, 1, request(), now());

        $this->assertNotNull($first);
        $this->assertNotNull($second);
        $this->assertNotSame($first->id, $second->id);
        $this->assertSame(2, BlockchainRecord::query()
            ->where('entity_id', $guard->id)
            ->where('proof_type', ProfileBlockchainService::PROOF_PASSWORD_CHANGED)
            ->count());
    }

    public function test_duplicate_payload_creation_reuses_existing_record_without_duplicate_jobs(): void
    {
        Bus::fake();

        $guard = $this->enableTwoFactor($this->guardUser());
        $changedAt = Carbon::parse('2026-06-29T10:00:00Z');

        $service = app(ProfileBlockchainService::class);
        $first = $service->recordPasswordChanged($guard, 5, 1, request(), $changedAt);
        $second = $service->recordPasswordChanged($guard, 5, 1, request(), $changedAt);

        $this->assertNotNull($first);
        $this->assertTrue($first->is($second));
        $this->assertSame(1, BlockchainRecord::query()->where('proof_type', ProfileBlockchainService::PROOF_PASSWORD_CHANGED)->count());
        Bus::assertDispatchedTimes(AnchorBlockchainRecordJob::class, 1);
    }

    public function test_verification_recomputes_profile_proof_hash_from_payload_summary(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());
        $changedAt = Carbon::parse('2026-06-29T10:00:00Z');

        config(['blockchain.enabled' => false]);

        $created = app(ProfileBlockchainService::class)->recordPasswordChanged(
            $guard,
            6,
            2,
            request(),
            $changedAt,
        );

        $this->assertNotNull($created);
        $this->assertSame('2026-06-29T10:00:00Z', $created->payload_summary['changed_at']);

        $record = $created->fresh();
        $record->update([
            'status' => 'confirmed',
            'contract_address' => '0x'.str_repeat('a', 40),
        ]);

        $this->fakeVerifyRpc(found: true);

        $verification = app(BlockchainVerificationService::class)->verify($record);

        $this->assertSame('valid', $verification->result);
        $this->assertSame($record->record_hash, $verification->recomputed_hash);
    }

    public function test_verification_recomputes_profile_proof_hash_from_manually_built_payload_summary(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());
        $changedAt = Carbon::parse('2026-06-29T10:00:00Z');
        $payload = app(ProfileBlockchainService::class)->buildCanonicalPayload(
            user: $guard,
            proofType: ProfileBlockchainService::PROOF_PASSWORD_CHANGED,
            profileVersion: 6,
            revokedCount: 2,
            changedAt: $changedAt,
        );
        $hash = app(BlockchainHashService::class)->hashPayload($payload);

        $record = BlockchainRecord::factory()->confirmed()->create([
            'entity_type' => ProfileBlockchainService::ENTITY_TYPE,
            'entity_id' => $guard->id,
            'proof_type' => ProfileBlockchainService::PROOF_PASSWORD_CHANGED,
            'canonical_version' => 'v1',
            'hash_algorithm' => 'sha256',
            'record_hash' => $hash['record_hash'],
            'payload_summary' => $hash['canonical_payload'],
            'contract_address' => '0x'.str_repeat('a', 40),
        ]);

        $this->fakeVerifyRpc(found: true);

        $verification = app(BlockchainVerificationService::class)->verify($record);

        $this->assertSame('valid', $verification->result);
        $this->assertSame($record->record_hash, $verification->recomputed_hash);
    }

    public function test_tampered_profile_payload_summary_returns_tampered_verification(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());
        $changedAt = Carbon::parse('2026-06-29T10:00:00Z');
        $payload = app(ProfileBlockchainService::class)->buildCanonicalPayload(
            user: $guard,
            proofType: ProfileBlockchainService::PROOF_PASSWORD_CHANGED,
            profileVersion: 6,
            revokedCount: 2,
            changedAt: $changedAt,
        );
        $hash = app(BlockchainHashService::class)->hashPayload($payload);

        $record = BlockchainRecord::factory()->confirmed()->create([
            'entity_type' => ProfileBlockchainService::ENTITY_TYPE,
            'entity_id' => $guard->id,
            'proof_type' => ProfileBlockchainService::PROOF_PASSWORD_CHANGED,
            'canonical_version' => 'v1',
            'hash_algorithm' => 'sha256',
            'record_hash' => $hash['record_hash'],
            'payload_summary' => array_merge($hash['canonical_payload'], ['profile_version' => 99]),
            'contract_address' => '0x'.str_repeat('a', 40),
        ]);

        $verification = app(BlockchainVerificationService::class)->verify($record);

        $this->assertSame('tampered', $verification->result);
        $this->assertNotSame($record->record_hash, $verification->recomputed_hash);
    }

    public function test_create_for_payload_supports_repeated_user_profile_proofs_with_different_hashes(): void
    {
        $userId = $this->guardUser()->id;
        $service = app(BlockchainRecordService::class);

        $firstPayload = [
            'module' => 'profile',
            'entity_type' => 'user_profile',
            'entity_id' => $userId,
            'proof_type' => 'profile_password_changed',
            'action' => 'profile_password_changed',
            'profile_version' => 2,
            'changed_at' => '2026-06-29T10:00:00Z',
            'actor_user_id' => $userId,
            'revoked_count' => 1,
            'source' => 'self_profile',
        ];
        $secondPayload = array_merge($firstPayload, ['profile_version' => 3]);

        $first = $service->createForPayload($firstPayload, $firstPayload);
        $second = $service->createForPayload($secondPayload, $secondPayload);

        $this->assertNotSame($first->id, $second->id);
        $this->assertSame(2, BlockchainRecord::query()->where('entity_type', 'user_profile')->count());
    }

    /**
     * @param  array<string, mixed>|null  $summary
     */
    private function assertPayloadSummaryIsSafe(?array $summary): void
    {
        $this->assertIsArray($summary);

        $forbiddenKeys = [
            'password',
            'otp',
            'token',
            'secret',
            'email',
            'refresh_token',
            'authorization',
            'private_key',
            'rpc_url',
            'two_factor_secret',
            'pending_secret',
        ];

        foreach ($forbiddenKeys as $key) {
            $this->assertArrayNotHasKey($key, $summary);
        }

        foreach ($summary as $key => $value) {
            if (! is_string($value)) {
                continue;
            }

            $this->assertStringNotContainsString('@', $value, "Unexpected raw email-like value in {$key}");
            $this->assertStringNotContainsString('Bearer ', $value, "Unexpected authorization material in {$key}");
        }
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function changePassword(User $user, array $overrides = [])
    {
        return $this->actingAs($user, 'api')
            ->postJson('/api/profile/password/change', array_merge([
                'current_password' => 'password',
                'otp' => $this->currentTotp(),
                'password' => 'newpassword12',
                'password_confirmation' => 'newpassword12',
            ], $overrides));
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function startEmailChange(User $user, array $overrides = [])
    {
        return $this->actingAs($user, 'api')
            ->postJson('/api/profile/email/start', array_merge([
                'current_password' => 'password',
                'otp' => $this->currentTotp(),
                'new_email' => 'changed.user@example.com',
            ], $overrides));
    }

    private function confirmEmailChange(User $user, string $token)
    {
        return $this->actingAs($user, 'api')
            ->postJson('/api/profile/email/confirm', ['token' => $token]);
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function startReconfigure(User $user, array $overrides = [])
    {
        return $this->actingAs($user, 'api')
            ->postJson('/api/profile/2fa/reconfigure/start', array_merge([
                'current_password' => 'password',
                'otp' => $this->currentTotp(),
            ], $overrides));
    }

    private function verifyReconfigure(User $user, string $token, string $otp)
    {
        return $this->actingAs($user, 'api')
            ->postJson('/api/profile/2fa/reconfigure/verify', [
                'two_factor_reconfigure_token' => $token,
                'otp' => $otp,
            ]);
    }

    private function plainTokenFromLastMail(): string
    {
        /** @var ProfileEmailChangeVerificationMail $mail */
        $mail = Mail::sent(ProfileEmailChangeVerificationMail::class)->last();

        return $mail->verificationToken;
    }

    private function fakeVerifyRpc(bool $found): void
    {
        \Illuminate\Support\Facades\Http::fake(function ($request) use ($found) {
            $body = json_decode($request->body(), true);

            return match ($body['method'] ?? null) {
                'eth_chainId' => \Illuminate\Support\Facades\Http::response(['jsonrpc' => '2.0', 'id' => 1, 'result' => '0x539']),
                'eth_call' => \Illuminate\Support\Facades\Http::response([
                    'jsonrpc' => '2.0',
                    'id' => 1,
                    'result' => $found
                        ? '0x'.str_repeat('0', 63).'1'
                        : '0x'.str_repeat('0', 64),
                ]),
                default => \Illuminate\Support\Facades\Http::response([
                    'jsonrpc' => '2.0',
                    'id' => 1,
                    'error' => ['code' => -32601, 'message' => 'Unhandled RPC method in test.'],
                ], 500),
            };
        });
    }
}
