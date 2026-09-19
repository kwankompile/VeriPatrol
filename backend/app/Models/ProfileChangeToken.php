<?php

namespace App\Models;

use Database\Factories\ProfileChangeTokenFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProfileChangeToken extends Model
{
    /** @use HasFactory<ProfileChangeTokenFactory> */
    use HasFactory, HasUuids;

    public const TYPE_EMAIL_CHANGE = 'email_change';

    public const TYPE_TWO_FACTOR_RECONFIGURE = 'two_factor_reconfigure';

    /** @return list<string> */
    public static function supportedTypes(): array
    {
        return [
            self::TYPE_EMAIL_CHANGE,
            self::TYPE_TWO_FACTOR_RECONFIGURE,
        ];
    }

    public static function isSupportedType(string $type): bool
    {
        return in_array($type, self::supportedTypes(), true);
    }

    public $incrementing = false;

    protected $keyType = 'string';

    /** @var list<string> */
    protected $fillable = [
        'user_id',
        'type',
        'token_hash',
        'pending_payload',
        'expires_at',
        'used_at',
        'ip_address',
        'user_agent',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'pending_payload' => 'encrypted:array',
            'expires_at' => 'datetime',
            'used_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function isExpired(): bool
    {
        return $this->expires_at !== null && $this->expires_at->isPast();
    }

    public function isUsed(): bool
    {
        return $this->used_at !== null;
    }

    public function isActive(): bool
    {
        return ! $this->isExpired() && ! $this->isUsed();
    }

    /**
     * Mark this token as used. Suitable for M1 tests and single-threaded flows.
     *
     * M6/M7 confirmation flows must consume tokens atomically (transaction or
     * whereNull('used_at')->where('expires_at', '>', now())->update(...)) to
     * prevent double-use race conditions under concurrent requests.
     */
    public function markUsed(): bool
    {
        if ($this->isUsed()) {
            return false;
        }

        $this->forceFill(['used_at' => now()])->save();

        return true;
    }

    public static function hashToken(string $plainToken): string
    {
        return hash('sha256', $plainToken);
    }

    /**
     * @param  Builder<ProfileChangeToken>  $query
     * @return Builder<ProfileChangeToken>
     */
    public function scopeActive(Builder $query): Builder
    {
        return $query
            ->whereNull('used_at')
            ->where('expires_at', '>', now());
    }

    /**
     * @param  Builder<ProfileChangeToken>  $query
     * @return Builder<ProfileChangeToken>
     */
    public function scopeOfType(Builder $query, string $type): Builder
    {
        return $query->where('type', $type);
    }
}
