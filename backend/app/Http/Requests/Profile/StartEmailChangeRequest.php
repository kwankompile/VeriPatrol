<?php

namespace App\Http\Requests\Profile;

use App\Http\Requests\Profile\Concerns\RejectsUnexpectedProfileFields;
use App\Models\User;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StartEmailChangeRequest extends FormRequest
{
    use RejectsUnexpectedProfileFields;

    /** @var list<string> */
    private const ALLOWED_KEYS = [
        'current_password',
        'otp',
        'new_email',
    ];

    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        if ($this->has('new_email')) {
            $this->merge([
                'new_email' => strtolower(trim((string) $this->input('new_email'))),
            ]);
        }
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $user = $this->user('api');
        $currentEmail = $user instanceof User
            ? strtolower(trim((string) $user->email))
            : '';

        return [
            'current_password' => ['required', 'string'],
            'otp' => ['required', 'string'],
            'new_email' => [
                'required',
                'email',
                'max:255',
                Rule::unique('users', 'email'),
                Rule::notIn([$currentEmail]),
            ],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $this->rejectUnexpectedKeys($validator, self::ALLOWED_KEYS);
    }
}
