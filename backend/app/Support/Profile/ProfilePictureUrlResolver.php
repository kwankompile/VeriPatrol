<?php

namespace App\Support\Profile;

use Illuminate\Support\Facades\Storage;

class ProfilePictureUrlResolver
{
    public function isExternalOrAbsoluteUrl(?string $value): bool
    {
        if ($value === null || $value === '') {
            return false;
        }

        return str_starts_with($value, 'http://')
            || str_starts_with($value, 'https://')
            || str_starts_with($value, '/');
    }

    public function isManagedStoragePath(?string $storedPath): bool
    {
        if ($storedPath === null || $storedPath === '' || $this->isExternalOrAbsoluteUrl($storedPath)) {
            return false;
        }

        $normalized = str_replace('\\', '/', $storedPath);

        if (str_contains($normalized, '..')) {
            return false;
        }

        $directory = trim((string) config('profile.profile_picture.directory', 'profile-pictures'), '/');

        return $normalized === $directory
            || str_starts_with($normalized, $directory.'/');
    }

    public function resolvePublicUrl(?string $storedPath): ?string
    {
        if ($storedPath === null || $storedPath === '') {
            return null;
        }

        if ($this->isExternalOrAbsoluteUrl($storedPath)) {
            return $this->normalizeLegacyPublicUrl($storedPath);
        }

        if (! $this->isManagedStoragePath($storedPath)) {
            return null;
        }

        return $this->relativeStorageUrl($storedPath);
    }

    public function fileExists(?string $storedPath): bool
    {
        if (! $this->isManagedStoragePath($storedPath)) {
            return false;
        }

        $disk = (string) config('profile.profile_picture.disk', 'public');

        return Storage::disk($disk)->exists($storedPath);
    }

    private function relativeStorageUrl(string $storedPath): string
    {
        $normalized = ltrim(str_replace('\\', '/', $storedPath), '/');

        return '/storage/'.$normalized;
    }

    private function normalizeLegacyPublicUrl(string $value): string
    {
        if (str_starts_with($value, '/storage/')) {
            return $value;
        }

        if (preg_match('#^https?://[^/]+(/storage/.+)$#', $value, $matches) === 1) {
            return $matches[1];
        }

        return $value;
    }

    public function deleteManagedFileIfExists(?string $storedPath): void
    {
        if (! $this->isManagedStoragePath($storedPath)) {
            return;
        }

        $disk = (string) config('profile.profile_picture.disk', 'public');

        if (Storage::disk($disk)->exists($storedPath)) {
            Storage::disk($disk)->delete($storedPath);
        }
    }
}
