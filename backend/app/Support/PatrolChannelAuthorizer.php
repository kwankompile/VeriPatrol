<?php

namespace App\Support;

use App\Models\User;

class PatrolChannelAuthorizer
{
    public static function isAdmin(?User $user): bool
    {
        return RoleAccess::isAdmin($user);
    }

    public static function canAccessPatrolMonitoring(?User $user): bool
    {
        return RoleAccess::canAccessMonitoring($user);
    }
}
