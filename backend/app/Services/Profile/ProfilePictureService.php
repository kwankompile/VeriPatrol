<?php

namespace App\Services\Profile;

use App\Models\User;
use App\Services\Auth\AuthAuditService;
use App\Support\Profile\ProfilePictureUrlResolver;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class ProfilePictureService
{
    public function __construct(
        private readonly AuthAuditService $authAuditService,
        private readonly ProfilePictureUrlResolver $profilePictureUrlResolver,
    ) {}

    public function uploadPicture(User $user, UploadedFile $file, Request $request): User
    {
        return DB::transaction(function () use ($user, $file, $request): User {
            /** @var User $locked */
            $locked = User::query()
                ->whereKey($user->getKey())
                ->lockForUpdate()
                ->firstOrFail();

            $previousPath = $locked->profile_picture_url;
            $storedPath = $this->storeUploadedFile($locked, $file);

            $locked->profile_picture_url = $storedPath;
            $locked->profile_version = ((int) $locked->profile_version) + 1;
            $locked->save();

            $this->profilePictureUrlResolver->deleteManagedFileIfExists($previousPath);

            $locked->load('role');

            $this->authAuditService->record(
                AuthAuditService::EVENT_PROFILE_PICTURE_UPLOADED,
                AuthAuditService::STATUS_SUCCESS,
                $request,
                user: $locked,
                metadata: [
                    'file_size' => $file->getSize(),
                    'mime_type' => $file->getMimeType(),
                    'profile_version' => (int) $locked->profile_version,
                    'source' => 'self_profile',
                ],
            );

            return $locked;
        });
    }

    /**
     * @return array{user: User, mutated: bool}
     */
    public function deletePicture(User $user, Request $request): array
    {
        return DB::transaction(function () use ($user, $request): array {
            /** @var User $locked */
            $locked = User::query()
                ->whereKey($user->getKey())
                ->lockForUpdate()
                ->firstOrFail();

            if ($locked->profile_picture_url === null || $locked->profile_picture_url === '') {
                return [
                    'user' => $locked->load('role'),
                    'mutated' => false,
                ];
            }

            $previousPath = $locked->profile_picture_url;

            $locked->profile_picture_url = null;
            $locked->profile_version = ((int) $locked->profile_version) + 1;
            $locked->save();

            $this->profilePictureUrlResolver->deleteManagedFileIfExists($previousPath);

            $locked->load('role');

            $this->authAuditService->record(
                AuthAuditService::EVENT_PROFILE_PICTURE_REMOVED,
                AuthAuditService::STATUS_SUCCESS,
                $request,
                user: $locked,
                metadata: [
                    'profile_version' => (int) $locked->profile_version,
                    'source' => 'self_profile',
                ],
            );

            return [
                'user' => $locked,
                'mutated' => true,
            ];
        });
    }

    private function storeUploadedFile(User $user, UploadedFile $file): string
    {
        $disk = (string) config('profile.profile_picture.disk', 'public');
        $directory = trim((string) config('profile.profile_picture.directory', 'profile-pictures'), '/');
        $extension = $this->resolveSafeExtension($file);
        $filename = Str::uuid()->toString().'.'.$extension;
        $relativeDirectory = $directory.'/'.$user->getKey();

        $storedPath = Storage::disk($disk)->putFileAs(
            $relativeDirectory,
            $file,
            $filename
        );

        if ($storedPath === false) {
            throw new \RuntimeException('Failed to store profile picture.');
        }

        return str_replace('\\', '/', $storedPath);
    }

    private function resolveSafeExtension(UploadedFile $file): string
    {
        $allowed = config('profile.profile_picture.allowed_mimes', ['jpg', 'jpeg', 'png', 'webp']);
        $extension = strtolower($file->extension() ?: $file->getClientOriginalExtension() ?: 'jpg');
        $normalized = $extension === 'jpeg' ? 'jpg' : $extension;

        if (in_array($extension, $allowed, true)) {
            return $extension === 'jpeg' ? 'jpg' : $extension;
        }

        if (in_array($normalized, $allowed, true)) {
            return $normalized;
        }

        return match ($file->getMimeType()) {
            'image/png' => 'png',
            'image/webp' => 'webp',
            default => 'jpg',
        };
    }
}
