import { useState, useEffect, useCallback } from 'react';

import { appDebugWarn } from 'utils/appDebug';

// ==============================|| HOOKS - LOCAL STORAGE ||============================== //

export function useLocalStorage(key, defaultValue) {
  const readValue = () => {
    if (typeof window === 'undefined') return defaultValue;

    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (err) {
      appDebugWarn(`Error reading localStorage key "${key}":`, err);
      return defaultValue;
    }
  };

  const [state, setState] = useState(readValue);

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch (err) {
      appDebugWarn(`Error setting localStorage key "${key}":`, err);
    }
  }, [key, state]);

  const setField = useCallback((fieldKey, value) => {
    setState((prev) => ({
      ...prev,
      [fieldKey]: value
    }));
  }, []);

  const resetState = useCallback(() => {
    setState(defaultValue);
    try {
      localStorage.setItem(key, JSON.stringify(defaultValue));
    } catch (err) {
      appDebugWarn(`Error resetting localStorage key "${key}":`, err);
    }
  }, [defaultValue, key]);

  return { state, setState, setField, resetState };
}
