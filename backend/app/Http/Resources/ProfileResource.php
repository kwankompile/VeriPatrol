<?php

namespace App\Http\Resources;

use App\Support\Profile\ProfilePictureUrlResolver;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\User */
class ProfileResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $resolver = app(ProfilePictureUrlResolver::class);

        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'phone' => $this->phone,
            'address' => $this->address,
            'profile_picture_url' => $resolver->resolvePublicUrl($this->profile_picture_url),
            'profile_version' => $this->profile_version,
            'two_factor_enabled' => $this->two_factor_enabled,
            'two_factor_confirmed_at' => $this->two_factor_confirmed_at,
            'email_verified_at' => $this->email_verified_at,
            'last_password_changed_at' => $this->last_password_changed_at,
            'last_security_changed_at' => $this->last_security_changed_at,
            'role' => $this->whenLoaded('role', function () {
                return [
                    'id' => $this->role?->id,
                    'name' => $this->role?->name,
                ];
            }),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
