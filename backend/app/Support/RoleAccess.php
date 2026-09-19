<?php

namespace App\Support;

use App\Models\User;

class RoleAccess
{
    public const ROLE_ADMIN = 'Admin';

    public const ROLE_SECURITY_OPERATOR = 'Security Operator';

    public const ROLE_GUARD = 'Guard';

    public static function isAdmin(?User $user): bool
    {
        return self::hasRole($user, self::ROLE_ADMIN);
    }

    public static function isSecurityOperator(?User $user): bool
    {
        return self::hasRole($user, self::ROLE_SECURITY_OPERATOR);
    }

    public static function isGuard(?User $user): bool
    {
        return self::hasRole($user, self::ROLE_GUARD);
    }

    public static function canAccessMonitoring(?User $user): bool
    {
        return self::isAdmin($user) || self::isSecurityOperator($user);
    }

    /**
     * @param  list<string>  $roles
     */
    public static function hasAnyRole(?User $user, array $roles): bool
    {
        if ($user === null) {
            return false;
        }

        foreach ($roles as $role) {
            if (self::hasRole($user, $role)) {
                return true;
            }
        }

        return false;
    }

    public static function hasRole(?User $user, string $roleName): bool
    {
        if ($user === null) {
            return false;
        }

        $user->loadMissing('role');

        return is_string($user->role?->name)
            && strcasecmp($user->role->name, $roleName) === 0;
    }
}
