<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreCameraRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $passwordMin = (int) config('auth_security.password_min_length', 12);

        return [
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', Rule::unique('cameras', 'email')],
            'password' => ['required', 'string', 'min:'.$passwordMin],
            'credential_enabled' => ['sometimes', 'boolean'],
            'location' => ['nullable', 'string', 'max:255'],
            'latitude' => ['nullable', 'numeric'],
            'longitude' => ['nullable', 'numeric'],
            'resolution_width' => ['nullable', 'integer'],
            'resolution_height' => ['nullable', 'integer'],
            'is_active' => ['sometimes', 'boolean'],
            'rtsp_url' => ['prohibited'],
            'ip_address' => ['prohibited'],
            'port' => ['prohibited'],
            'username' => ['prohibited'],
            'last_login_at' => ['prohibited'],
            'last_seen_at' => ['prohibited'],
            'rtsp_reported_at' => ['prohibited'],
        ];
    }
}
