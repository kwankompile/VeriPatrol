import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useLocalStorage } from './useLocalStorage';

describe('useLocalStorage', () => {
  const storageKey = 'test-storage-key';

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('setField preserves previous state and updates one field', () => {
    const defaults = { theme: 'light', font: 'Inter' };
    const { result } = renderHook(() => useLocalStorage(storageKey, defaults));

    expect(result.current.state).toEqual(defaults);

    act(() => {
      result.current.setField('theme', 'dark');
    });

    expect(result.current.state).toEqual({ theme: 'dark', font: 'Inter' });
    expect(JSON.parse(localStorage.getItem(storageKey))).toEqual({ theme: 'dark', font: 'Inter' });
  });

  it('does not warn on localStorage read errors unless app debug is enabled', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    const { result } = renderHook(() => useLocalStorage(storageKey, { ok: true }));

    expect(result.current.state).toEqual({ ok: true });
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
