<?php

namespace App\Http\Resources;

use App\Models\Camera;
use App\Support\RtspUrlMasker;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Camera
 */
class CameraResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $maskedRtspUrl = RtspUrlMasker::mask($this->rtsp_url);

        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'credential_enabled' => $this->credential_enabled,
            'is_active' => $this->is_active,
            'location' => $this->location,
            'rtsp_url' => $maskedRtspUrl,
            'rtsp_url_masked' => $maskedRtspUrl,
            'rtsp_reported_at' => $this->rtsp_reported_at?->toIso8601String(),
            'last_login_at' => $this->last_login_at?->toIso8601String(),
            'last_seen_at' => $this->last_seen_at?->toIso8601String(),
            'credential_rotated_at' => $this->credential_rotated_at?->toIso8601String(),
            'latitude' => $this->latitude,
            'longitude' => $this->longitude,
            'resolution_width' => $this->resolution_width,
            'resolution_height' => $this->resolution_height,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
