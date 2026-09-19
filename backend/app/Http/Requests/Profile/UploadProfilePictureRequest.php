<?php

namespace App\Http\Requests\Profile;

use App\Http\Requests\Profile\Concerns\RejectsUnexpectedProfileFields;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;

class UploadProfilePictureRequest extends FormRequest
{
    use RejectsUnexpectedProfileFields;

    /** @var list<string> */
    private const ALLOWED_KEYS = [
        'image',
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
        $mimes = config('profile.profile_picture.allowed_mimes', ['jpg', 'jpeg', 'png', 'webp']);
        $maxKb = (int) config('profile.profile_picture.max_size_kb', 2048);

        return [
            'image' => [
                'required',
                'file',
                'image',
                'mimes:'.implode(',', $mimes),
                'max:'.$maxKb,
            ],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $this->rejectUnexpectedKeys($validator, self::ALLOWED_KEYS);
    }
}
