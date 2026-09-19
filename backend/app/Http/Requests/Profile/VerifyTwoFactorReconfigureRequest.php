<?php

namespace App\Http\Requests\Profile;

use App\Http\Requests\Profile\Concerns\RejectsUnexpectedProfileFields;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;

class VerifyTwoFactorReconfigureRequest extends FormRequest
{
    use RejectsUnexpectedProfileFields;

    /** @var list<string> */
    private const ALLOWED_KEYS = [
        'two_factor_reconfigure_token',
        'otp',
    ];

    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'two_factor_reconfigure_token' => ['required', 'string'],
            'otp' => ['required', 'string'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $this->rejectUnexpectedKeys($validator, self::ALLOWED_KEYS);
    }
}
