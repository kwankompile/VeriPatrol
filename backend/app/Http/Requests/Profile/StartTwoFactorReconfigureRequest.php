<?php

namespace App\Http\Requests\Profile;

use App\Http\Requests\Profile\Concerns\RejectsUnexpectedProfileFields;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;

class StartTwoFactorReconfigureRequest extends FormRequest
{
    use RejectsUnexpectedProfileFields;

    /** @var list<string> */
    private const ALLOWED_KEYS = [
        'current_password',
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
            'current_password' => ['required', 'string'],
            'otp' => ['required', 'string'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $this->rejectUnexpectedKeys($validator, self::ALLOWED_KEYS);
    }
}
