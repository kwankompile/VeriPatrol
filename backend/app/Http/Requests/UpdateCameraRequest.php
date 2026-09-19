<?php

namespace App\Http\Requests;

use App\Models\Camera;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateCameraRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        if ($this->has('password') && $this->input('password') === '') {
            $payload = $this->all();
            unset($payload['password']);
            $this->replace($payload);
        }
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        /** @var Camera|null $camera */
        $camera = $this->route('camera');
        $passwordMin = (int) config('auth_security.password_min_length', 12);

        return [
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'email' => [
                'sometimes',
                'required',
                'email',
                'max:255',
                Rule::unique('cameras', 'email')->ignore($camera?->id),
            ],
            'password' => ['sometimes', 'string', 'min:'.$passwordMin],
            'credential_enabled' => ['sometimes', 'boolean'],
            'location' => ['sometimes', 'nullable', 'string', 'max:255'],
            'latitude' => ['sometimes', 'nullable', 'numeric'],
            'longitude' => ['sometimes', 'nullable', 'numeric'],
            'resolution_width' => ['sometimes', 'nullable', 'integer'],
            'resolution_height' => ['sometimes', 'nullable', 'integer'],
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
