import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDisconnect = vi.fn();
const mockClearAuthSession = vi.fn();
const mockNavigate = vi.fn();

vi.mock('services/realtime/broadcastService', () => ({
  default: {
    disconnect: (...args) => mockDisconnect(...args)
  }
}));

vi.mock('utils/auth', () => ({
  clearAuthSession: (...args) => mockClearAuthSession(...args)
}));

import { endProfileSensitiveSession } from './profileSensitiveSession';

describe('endProfileSensitiveSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('disconnects realtime, clears auth, and redirects to login', () => {
    endProfileSensitiveSession(mockNavigate);

    expect(mockDisconnect).toHaveBeenCalledTimes(1);
    expect(mockClearAuthSession).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
  });

  it('still clears auth and redirects when realtime disconnect fails', () => {
    mockDisconnect.mockImplementationOnce(() => {
      throw new Error('disconnect failed');
    });

    endProfileSensitiveSession(mockNavigate);

    expect(mockDisconnect).toHaveBeenCalledTimes(1);
    expect(mockClearAuthSession).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
  });
});
