import { describe, expect, it, vi } from 'vitest';

import { resolveProfilePictureUrl } from './getImageUrl';

describe('resolveProfilePictureUrl', () => {
  it('resolves relative storage paths against the API origin', () => {
    expect(resolveProfilePictureUrl('/storage/profile-pictures/1/avatar.jpg')).toBe(
      'http://localhost:8000/storage/profile-pictures/1/avatar.jpg'
    );
  });

  it('normalizes legacy localhost storage URLs without port', () => {
    expect(resolveProfilePictureUrl('http://localhost/storage/profile-pictures/1/avatar.jpg')).toBe(
      'http://localhost:8000/storage/profile-pictures/1/avatar.jpg'
    );
  });

  it('returns null for empty values', () => {
    expect(resolveProfilePictureUrl(null)).toBeNull();
    expect(resolveProfilePictureUrl('')).toBeNull();
  });

  it('passes through external CDN URLs unchanged', () => {
    const url = 'https://cdn.example.test/avatar.jpg';
    expect(resolveProfilePictureUrl(url)).toBe(url);
  });
});
