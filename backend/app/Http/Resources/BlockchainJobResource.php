<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class BlockchainJobResource extends JsonResource
{
    private function displayAttempts(): int
    {
        $attempts = (int) ($this->attempts ?? 0);
        $maxAttempts = (int) ($this->max_attempts ?? 0);

        if ($maxAttempts > 0) {
            return min($attempts, $maxAttempts);
        }

        return $attempts;
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'blockchain_record_id' => $this->blockchain_record_id,
            'job_type' => $this->job_type,
            'status' => $this->status,
            'attempts' => $this->displayAttempts(),
            'max_attempts' => $this->max_attempts,
            'next_attempt_at' => $this->next_attempt_at,
            'started_at' => $this->started_at,
            'finished_at' => $this->finished_at,
            'last_error' => $this->last_error,
            'context_tx_hash' => $this->context_tx_hash ?? null,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
