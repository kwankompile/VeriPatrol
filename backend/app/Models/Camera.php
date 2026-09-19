<?php

namespace App\Models;

use Database\Factories\CameraFactory;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use PHPOpenSourceSaver\JWTAuth\Contracts\JWTSubject;

class Camera extends Authenticatable implements JWTSubject
{
    /** @use HasFactory<CameraFactory> */
    use HasFactory, HasUuids;

    public const PRINCIPAL_TYPE = 'camera';

    public $incrementing = false;

    protected $keyType = 'string';

    /**
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'email',
        'password',
        'credential_enabled',
        'credential_rotated_at',
        'location',
        'rtsp_url',
        'rtsp_reported_at',
        'ip_address',
        'port',
        'username',
        'latitude',
        'longitude',
        'resolution_width',
        'resolution_height',
        'is_active',
        'last_login_at',
        'last_seen_at',
    ];

    /**
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'username',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'latitude' => 'decimal:7',
            'longitude' => 'decimal:7',
            'is_active' => 'boolean',
            'credential_enabled' => 'boolean',
            'last_login_at' => 'datetime',
            'last_seen_at' => 'datetime',
            'rtsp_reported_at' => 'datetime',
            'credential_rotated_at' => 'datetime',
        ];
    }

    public function getJWTIdentifier(): mixed
    {
        return $this->getKey();
    }

    /**
     * @return array<string, mixed>
     */
    public function getJWTCustomClaims(): array
    {
        return [
            'principal_type' => self::PRINCIPAL_TYPE,
        ];
    }
}
