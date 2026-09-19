import { beforeEach, describe, expect, it } from 'vitest';

import { AUTH_USER_KEY } from 'utils/auth';

import { mergeAuthUserWithProfileUpdate, syncAuthUserFromProfile } from './profileAuthSync';

describe('profileAuthSync', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('merges profile fields without discarding auth-only fields', () => {
    localStorage.setItem(
      AUTH_USER_KEY,
      JSON.stringify({
        id: 'user-1',
        setup_required: false,
        two_factor_enabled: true,
        role: { name: 'Guard' },
        phone: '0111111111'
      })
    );

    const merged = mergeAuthUserWithProfileUpdate({
      raw: {
        id: 'user-1',
        name: 'Updated Guard',
        email: 'guard@example.com',
        phone: '0123456789',
        address: 'Kuala Lumpur',
        profile_version: 5,
        role: { name: 'Guard' }
      }
    });

    expect(merged).toMatchObject({
      setup_required: false,
      two_factor_enabled: true,
      phone: '0123456789',
      address: 'Kuala Lumpur',
      profile_version: 5,
      name: 'Updated Guard'
    });
  });

  it('syncAuthUserFromProfile writes resolved profile_picture_url to storage', () => {
    localStorage.setItem(
      AUTH_USER_KEY,
      JSON.stringify({
        id: 'user-1',
        profile_picture_url: '/storage/old.jpg'
      })
    );

    syncAuthUserFromProfile({
      raw: {
        id: 'user-1',
        profile_picture_url: '/storage/new.jpg'
      },
      profilePictureUrl: 'http://localhost:8000/storage/new.jpg',
      profileVersion: 4
    });

    const stored = JSON.parse(localStorage.getItem(AUTH_USER_KEY) ?? '{}');
    expect(stored.profile_picture_url).toBe('http://localhost:8000/storage/new.jpg');
    expect(stored.profile_version).toBe(4);
  });

  it('syncAuthUserFromProfile writes null profile_picture_url when picture removed', () => {
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify({ id: 'user-1', profile_picture_url: 'http://localhost:8000/storage/old.jpg' }));

    syncAuthUserFromProfile({
      raw: { id: 'user-1', profile_picture_url: null },
      profilePictureUrl: null,
      profileVersion: 5
    });

    const stored = JSON.parse(localStorage.getItem(AUTH_USER_KEY) ?? '{}');
    expect(stored.profile_picture_url).toBeNull();
  });

  it('syncAuthUserFromProfile writes merged auth_user to storage', () => {
    localStorage.setItem(
      AUTH_USER_KEY,
      JSON.stringify({
        id: 'user-1',
        setup_required: false,
        two_factor_enabled: true
      })
    );

    syncAuthUserFromProfile({
      raw: {
        id: 'user-1',
        name: 'Guard User',
        phone: '0999999999',
        profile_version: 3
      }
    });

    const stored = JSON.parse(localStorage.getItem(AUTH_USER_KEY) ?? '{}');
    expect(stored.phone).toBe('0999999999');
    expect(stored.setup_required).toBe(false);
    expect(stored.two_factor_enabled).toBe(true);
  });
});
