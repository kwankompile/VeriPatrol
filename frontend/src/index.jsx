import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';

import { PWA_SYNC_REQUEST_MESSAGE_TYPE } from 'pwa/backgroundSyncService';
import { flushSyncQueue, registerBackgroundSyncIfQueueHasWork } from 'pwa/syncService';
import { pwaDebug, pwaWarn } from 'pwa/pwaLogger';

// project imports
import App from 'App';
import reportWebVitals from 'reportWebVitals';
import RootErrorBoundary from 'components/RootErrorBoundary';
import { ConfigProvider } from 'contexts/ConfigContext';

// style + assets
import 'assets/scss/style.scss';

// google-fonts
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/300.css';
import '@fontsource/roboto/700.css';

import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';

import '@fontsource/poppins/400.css';
import '@fontsource/poppins/500.css';
import '@fontsource/poppins/600.css';
import '@fontsource/poppins/700.css';

// ==============================|| REACT DOM RENDER ||============================== //

const container = document.getElementById('root');
const root = createRoot(container);
root.render(
  <RootErrorBoundary>
    <ConfigProvider>
      <App />
    </ConfigProvider>
  </RootErrorBoundary>
);

if (typeof window !== 'undefined') {
  try {
    registerSW({
      immediate: true,
      onOfflineReady() {
        pwaDebug('[PWA] Offline shell ready (precache populated)');
      },
      onRegistered(registration) {
        if (registration) {
          pwaDebug('[PWA] Service worker registered');
        }
      },
      onRegisterError(error) {
        pwaWarn('[PWA] Service worker registration failed', error);
      }
    });
  } catch (e) {
    pwaWarn('[PWA] registerSW could not run:', e);
  }

  try {
    if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
      pwaDebug('[PWA] Network status:', navigator.onLine ? 'online' : 'offline');
    }
    window.addEventListener('online', () => pwaDebug('[PWA] Browser reports online'));
    window.addEventListener('offline', () => pwaDebug('[PWA] Browser reports offline'));
  } catch (e) {
    pwaWarn('[PWA] Network status listeners failed:', e);
  }

  try {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type !== PWA_SYNC_REQUEST_MESSAGE_TYPE) {
          return;
        }
        pwaDebug('[PWA] Service worker requested sync flush');
        flushSyncQueue();
      });
    }
    registerBackgroundSyncIfQueueHasWork().catch(() => {});
  } catch (e) {
    pwaWarn('[PWA] Background Sync setup failed:', e);
  }
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
