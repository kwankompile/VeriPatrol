<?php

return [

    'gps' => [
        'good_accuracy_meters' => env('PATROL_GPS_GOOD_ACCURACY_METERS', 25),
        'poor_accuracy_meters' => env('PATROL_GPS_POOR_ACCURACY_METERS', 75),
        'ignore_accuracy_meters' => env('PATROL_GPS_IGNORE_ACCURACY_METERS', 150),
        'accuracy_radius_weight' => env('PATROL_GPS_ACCURACY_RADIUS_WEIGHT', 0.5),
    ],

    'movement' => [
        'gap_threshold_seconds' => env('PATROL_GAP_THRESHOLD_SECONDS', 30),
        'gap_factor_medium_seconds' => env('PATROL_GAP_FACTOR_MEDIUM_SECONDS', 10),
        'gap_factor_large_seconds' => env('PATROL_GAP_FACTOR_LARGE_SECONDS', 60),
        'max_speed_mps' => env('PATROL_MAX_SPEED_MPS', 41.67),
        'gps_jump_distance_meters' => env('PATROL_GPS_JUMP_DISTANCE_METERS', 100),
        'gps_jump_max_seconds' => env('PATROL_GPS_JUMP_MAX_SECONDS', 5),
        'severe_jump_distance_meters' => env('PATROL_SEVERE_JUMP_DISTANCE_METERS', 300),
        'min_consecutive_bad_segments' => env('PATROL_MIN_CONSECUTIVE_BAD_SEGMENTS', 2),
    ],

    'route_corridor' => [
        'enabled' => env('PATROL_ROUTE_CORRIDOR_ENABLED', true),
        'corridor_meters' => env('PATROL_ROUTE_CORRIDOR_METERS', 75),
        'severe_deviation_meters' => env('PATROL_ROUTE_SEVERE_DEVIATION_METERS', 180),
        'min_consecutive_deviation_points' => env('PATROL_ROUTE_MIN_CONSECUTIVE_DEVIATION_POINTS', 3),
    ],

    'checkpoint' => [
        'min_continuous_dwell_seconds' => env('PATROL_MIN_CONTINUOUS_DWELL_SECONDS', 3),
        'resume_max_confidence' => env('PATROL_RESUME_MAX_CONFIDENCE', 79),
        'default_accuracy_meters' => env('PATROL_DEFAULT_ACCURACY_METERS', 50),
    ],

    'scoring' => [
        'weight_distance' => env('PATROL_WEIGHT_DISTANCE', 0.30),
        'weight_accuracy' => env('PATROL_WEIGHT_ACCURACY', 0.25),
        'weight_time' => env('PATROL_WEIGHT_TIME', 0.25),
        'weight_stability' => env('PATROL_WEIGHT_STABILITY', 0.20),
        'integrity_factor_strong' => env('PATROL_INTEGRITY_FACTOR_STRONG', 0.5),
        'integrity_factor_moderate' => env('PATROL_INTEGRITY_FACTOR_MODERATE', 0.9),
    ],

];
