import PropTypes from 'prop-types';
import { createContext, useContext, useMemo } from 'react';

// project imports
import appConfig from 'config';
import { useLocalStorage } from 'hooks/useLocalStorage';

// ==============================|| CONFIG CONTEXT ||============================== //

/** Sentinel so we never conflate “outside provider” with a legitimate undefined value. */
const CONFIG_CONTEXT_EMPTY = Symbol.for('@berry/config-context-empty');

export const ConfigContext = createContext(CONFIG_CONTEXT_EMPTY);

let warnedConfigOutsideProvider = false;

/** Defaults when localStorage-backed state is unavailable (must match theme/layout expectations). */
const FALLBACK_CONFIG_STATE = {
  ...appConfig,
  miniDrawer: true,
  outlinedFilled: true,
  presetColor: 'default',
  container: true
};

const noop = () => {};

// ==============================|| CONFIG - HOOK (same module as Provider) ||============================== //

export function useConfig() {
  const ctx = useContext(ConfigContext);
  const fallbackApi = useMemo(
    () => ({
      state: { ...FALLBACK_CONFIG_STATE },
      setState: noop,
      setField: noop,
      resetState: noop
    }),
    []
  );

  if (ctx === CONFIG_CONTEXT_EMPTY) {
    if (!warnedConfigOutsideProvider) {
      warnedConfigOutsideProvider = true;
      console.warn(
        '[Config] useConfig ran outside ConfigProvider, or multiple React copies broke context. Using non-persistent defaults so the app can render.'
      );
    }
    return fallbackApi;
  }
  return ctx;
}

// ==============================|| CONFIG PROVIDER ||============================== //

export function ConfigProvider({ children }) {
  const { state, setState, setField, resetState } = useLocalStorage('berry-config-vite-js', appConfig);

  const memoizedValue = useMemo(() => ({ state, setState, setField, resetState }), [state, setField, setState, resetState]);

  return <ConfigContext.Provider value={memoizedValue}>{children}</ConfigContext.Provider>;
}

ConfigProvider.propTypes = { children: PropTypes.node };
