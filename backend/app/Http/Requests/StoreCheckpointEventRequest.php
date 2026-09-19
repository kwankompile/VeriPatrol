<?php

namespace App\Http\Requests;

use App\Support\CheckpointEventStatus;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class StoreCheckpointEventRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        if ($this->has('status')) {
            $this->merge([
                'status' => CheckpointEventStatus::normalizeInput($this->input('status')),
            ]);
        }
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'patrol_session_id' => ['required', 'uuid', 'exists:patrol_sessions,id'],
            'checkpoint_id' => ['required', 'uuid', 'exists:checkpoints,id'],
            'entered_at' => ['nullable', 'date'],
            'exited_at' => ['nullable', 'date', 'after_or_equal:entered_at'],
            'detected_at' => ['nullable', 'date'],
            'processed_at' => ['nullable', 'date'],
            'detection_type' => ['nullable', 'in:continuous,resume,manual'],
            'confidence_score' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'status' => CheckpointEventStatus::validationRule(),
        ];
    }
}
