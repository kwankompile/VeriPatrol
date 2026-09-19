import { getAuthUser, setAuthUser } from 'utils/auth';

/**
 * @param {import('../repositories/ProfileRepository').NormalizedProfileUser} profile
 */
export function mergeAuthUserWithProfileUpdate(profile) {
  const existingUser = getAuthUser() ?? {};
  const raw = profile.raw ?? {};

  return {
    ...existingUser,
    ...raw,
    role: raw.role ?? existingUser.role,
    // Use the already-resolved URL from ProfileRepository.normalizeUser() so that
    // the header avatar gets a fully-qualified URL (e.g. http://localhost:8000/storage/...)
    // rather than the raw relative path returned by the backend (/storage/...).
    profile_picture_url: profile.profilePictureUrl ?? null,
    profile_version: profile.profileVersion ?? raw.profile_version ?? existingUser.profile_version,
  };
}

/**
 * @param {import('../repositories/ProfileRepository').NormalizedProfileUser} profile
 */
export function syncAuthUserFromProfile(profile) {
  const merged = mergeAuthUserWithProfileUpdate(profile);
  setAuthUser(merged);
  return merged;
}
