<?php

return [
    'profile_picture' => [
        'disk' => env('PROFILE_PICTURE_DISK', 'public'),
        'directory' => env('PROFILE_PICTURE_DIRECTORY', 'profile-pictures'),
        'max_size_kb' => (int) env('PROFILE_PICTURE_MAX_SIZE_KB', 2048),
        'allowed_mimes' => array_filter(array_map('trim', explode(',', env('PROFILE_PICTURE_ALLOWED_MIMES', 'jpg,jpeg,png,webp')))),
    ],

    'change_tokens' => [
        'ttl_minutes' => (int) env('PROFILE_CHANGE_TOKEN_TTL_MINUTES', 10),
    ],

    'step_up' => [
        'max_attempts' => (int) env('PROFILE_STEP_UP_MAX_ATTEMPTS', 5),
        'decay_seconds' => (int) env('PROFILE_STEP_UP_DECAY_SECONDS', 300),
    ],

    'security' => [
        'allow_user_two_factor_disable' => false,
        'require_step_up_for_sensitive_changes' => true,
        'revoke_sessions_after_sensitive_changes' => true,
    ],
];
