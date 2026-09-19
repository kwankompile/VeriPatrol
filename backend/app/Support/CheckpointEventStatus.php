<?php

namespace App\Support;

class CheckpointEventStatus
{
    public const PENDING = 'pending';

    public const VERIFIED = 'verified';

    public const PARTIAL = 'partial';

    public const NEEDS_REVIEW = 'needs_review';

    public const SUSPICIOUS = 'suspicious';

    public const MISSED = 'missed';

    /**
     * Statuses persisted after the M8 migration.
     *
     * @return list<string>
     */
    public static function canonical(): array
    {
        return [
            self::PENDING,
            self::VERIFIED,
            self::PARTIAL,
            self::NEEDS_REVIEW,
            self::SUSPICIOUS,
            self::MISSED,
        ];
    }

    /**
     * Values accepted on API input (includes legacy aliases).
     *
     * @return list<string>
     */
    public static function inputAllowed(): array
    {
        return array_merge(self::canonical(), ['uncertain', 'rejected']);
    }

    /**
     * Laravel validation rule fragment for status fields.
     *
     * @return list<string>
     */
    public static function validationRule(bool $required = false): array
    {
        $rules = $required ? ['required'] : ['nullable'];
        $rules[] = 'string';
        $rules[] = 'in:'.implode(',', self::inputAllowed());

        return $rules;
    }

    /**
     * Normalize API request status values before validation/persistence.
     * Non-scalar input is returned unchanged so Laravel validation can reject it.
     */
    public static function normalizeInput(mixed $status): mixed
    {
        if ($status === null) {
            return null;
        }

        if (! is_scalar($status)) {
            return $status;
        }

        return self::normalize((string) $status);
    }

    /**
     * Map legacy API / row values to canonical persistence statuses.
     */
    public static function normalize(?string $status): ?string
    {
        if ($status === null) {
            return null;
        }

        $key = strtolower(trim($status));

        return match ($key) {
            'uncertain' => self::NEEDS_REVIEW,
            'rejected' => self::MISSED,
            default => $key,
        };
    }

    /**
     * Normalize status inside validated request payloads before persistence.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public static function normalizePayload(array $data): array
    {
        if (array_key_exists('status', $data) && $data['status'] !== null) {
            $data['status'] = self::normalize(is_scalar($data['status']) ? (string) $data['status'] : null);
        }

        return $data;
    }
}
