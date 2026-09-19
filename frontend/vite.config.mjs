import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, normalizePath } from 'vite';
import react from '@vitejs/plugin-react';
import jsconfigPaths from 'vite-jsconfig-paths';
import { VitePWA } from 'vite-plugin-pwa';

import {
  buildNavigateFallbackAllowlist,
  buildNavigateFallbackDenylist,
  buildRuntimeCaching
} from './pwa/workbox-runtime-caching.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(__dirname, 'src');
const NODE_MODULES = path.resolve(__dirname, 'node_modules');
const REACT_PKG = path.join(NODE_MODULES, 'react');
const REACT_DOM_PKG = path.join(NODE_MODULES, 'react-dom');
const EMOTION_REACT_PKG = path.join(NODE_MODULES, '@emotion/react');
const EMOTION_STYLED_PKG = path.join(NODE_MODULES, '@emotion/styled');
const CONFIG_CONTEXT_FILE = path.resolve(SRC_DIR, 'contexts/ConfigContext.jsx');
const USE_CONFIG_FILE = path.resolve(SRC_DIR, 'hooks/useConfig.js');
const USE_LOCAL_STORAGE_FILE = path.resolve(SRC_DIR, 'hooks/useLocalStorage.js');
const APP_CONFIG_FILE = path.resolve(SRC_DIR, 'config.js');

const SINGLETON_PACKAGES = [
  'react',
  'react-dom',
  'scheduler',
  '@emotion/react',
  '@emotion/styled',
  '@emotion/cache',
  '@emotion/utils',
  '@emotion/serialize',
  '@emotion/use-insertion-effect-with-fallbacks'
];

function normalizeAppBaseName(rawBaseName) {
  const trimmed = (rawBaseName || '/').trim();
  if (!trimmed || trimmed === '/') {
    return '/';
  }

  const withoutTrailingSlash = trimmed.replace(/\/+$/, '');
  const withLeadingSlash = withoutTrailingSlash.startsWith('/') ? withoutTrailingSlash : `/${withoutTrailingSlash}`;
  return withLeadingSlash || '/';
}

function toViteBasePath(appBaseName) {
  return appBaseName === '/' ? '/' : `${appBaseName}/`;
}

function withAppBasePath(viteBasePath, resourcePath) {
  const normalizedResource = resourcePath.startsWith('/') ? resourcePath.slice(1) : resourcePath;
  return viteBasePath === '/' ? `/${normalizedResource}` : `${viteBasePath}${normalizedResource}`;
}

/** Mirrors jsconfig `"baseUrl": "src"` when vite-jsconfig-paths skips ids with no importer (Vite 7 prod graph). */
const WORKBOX_LOG_DISABLE_SNIPPET = 'self.__WB_DISABLE_DEV_LOGS=true;\n';

/** Prepend Workbox log disable before the bundled workbox module evaluates (Vite PWA loads workbox first). */
function silenceWorkboxServiceWorkerLogs(rootDir) {
  function prependIfNeeded(filePath) {
    if (!fs.existsSync(filePath)) {
      return;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    if (content.startsWith(WORKBOX_LOG_DISABLE_SNIPPET.trim())) {
      return;
    }

    fs.writeFileSync(filePath, WORKBOX_LOG_DISABLE_SNIPPET + content, 'utf8');
  }

  return {
    name: 'silence-workbox-sw-logs',
    enforce: 'post',
    closeBundle() {
      prependIfNeeded(path.resolve(rootDir, 'dist/sw.js'));
    },
    configureServer(server) {
      const devSwPath = path.resolve(rootDir, 'dev-dist/sw.js');
      server.middlewares.use((req, res, next) => {
        res.on('finish', () => {
          if (typeof req.url === 'string' && req.url.includes('sw.js')) {
            prependIfNeeded(devSwPath);
          }
        });
        next();
      });
    }
  };
}

function jsconfigSrcBaseUrlFallback() {
  const tryExtensions = ['', '.jsx', '.js', '.tsx', '.ts', '.mjs', '.scss', '.sass', '.css'];

  return {
    name: 'jsconfig-src-baseurl-fallback',
    enforce: 'pre',
    async resolveId(id, importer, options) {
      const bare = id.replace(/\?.*$/, '');
      if (!bare || bare.startsWith('.') || bare.startsWith('\0') || path.isAbsolute(bare)) {
        return;
      }

      if (
        bare === 'react' ||
        bare === 'react-dom' ||
        bare === 'scheduler' ||
        bare.startsWith('react/') ||
        bare.startsWith('react-dom/') ||
        bare === '@emotion/react' ||
        bare === '@emotion/styled' ||
        bare.startsWith('@emotion/')
      ) {
        return undefined;
      }

      const resolutionImporter = importer ?? path.join(SRC_DIR, 'index.jsx');

      const resolved = await this.resolve(bare, resolutionImporter, { ...options, skipSelf: true }).catch(() => null);
      if (resolved?.id && !resolved.external) {
        return normalizePath(resolved.id);
      }

      const candidate = path.join(SRC_DIR, bare);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return normalizePath(candidate);
      }
      for (const ext of tryExtensions) {
        const withExt = candidate + ext;
        if (fs.existsSync(withExt) && fs.statSync(withExt).isFile()) {
          return normalizePath(withExt);
        }
      }
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
        for (const ext of tryExtensions) {
          const indexFile = path.join(candidate, `index${ext}`);
          if (fs.existsSync(indexFile) && fs.statSync(indexFile).isFile()) {
            return normalizePath(indexFile);
          }
        }
      }
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const appBaseName = normalizeAppBaseName(env.VITE_APP_BASE_NAME);
  const viteBasePath = toViteBasePath(appBaseName);
  const API_BASE_URL = env.VITE_API_BASE_URL || 'http://localhost:8000/api';
  const PORT = 3000;

  return {
    server: {
      open: true,
      port: PORT,
      host: true
    },
    build: {
      chunkSizeWarningLimit: 1600,
      // Production builds use React's production bundle (no React DevTools console prompt).
      minify: 'esbuild',
      sourcemap: false
    },
    preview: {
      open: true,
      host: true
    },
    optimizeDeps: {
      dedupe: SINGLETON_PACKAGES,
      include: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
        '@emotion/react',
        '@emotion/styled',
        '@mui/material',
        '@mui/material/styles'
      ]
    },
    define: {
      global: 'window'
    },
    resolve: {
      dedupe: SINGLETON_PACKAGES,
      alias: {
        react: REACT_PKG,
        'react-dom': REACT_DOM_PKG,
        'react/jsx-runtime': path.join(REACT_PKG, 'jsx-runtime.js'),
        'react/jsx-dev-runtime': path.join(REACT_PKG, 'jsx-dev-runtime.js'),
        '@emotion/react': EMOTION_REACT_PKG,
        '@emotion/styled': EMOTION_STYLED_PKG,
        'contexts/ConfigContext': CONFIG_CONTEXT_FILE,
        'hooks/useConfig': USE_CONFIG_FILE,
        'hooks/useLocalStorage': USE_LOCAL_STORAGE_FILE,
        config: APP_CONFIG_FILE,
        '@tabler/icons-react': '@tabler/icons-react/dist/esm/icons/index.mjs'
      }
    },
    base: viteBasePath,
    plugins: [
      jsconfigSrcBaseUrlFallback(),
      react(),
      jsconfigPaths(),
      VitePWA({
        registerType: 'prompt',
        injectRegister: false,
        // Enable the service worker in Vite dev server so push notifications
        // can be tested without a production build.
        devOptions: {
          enabled: true,
          type: 'module',
          // Avoid CacheFirst runtime rules caching Vite dev chunks (duplicate React/Emotion on soft reload).
          disableRuntimeConfig: true
        },
        includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
        manifest: {
          name: 'VeriPatrol',
          short_name: 'VeriPatrol',
          description: 'Secure AI surveillance and patrol verification platform.',
          display: 'standalone',
          start_url: viteBasePath,
          scope: viteBasePath,
          theme_color: '#111827',
          background_color: '#0F172A',
          icons: [
            {
              src: withAppBasePath(viteBasePath, '/icons/icon-192.png'),
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: withAppBasePath(viteBasePath, '/icons/icon-512.png'),
              sizes: '512x512',
              type: 'image/png'
            },
            {
              src: withAppBasePath(viteBasePath, '/icons/icon-512-maskable.png'),
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable'
            },
            {
              src: withAppBasePath(viteBasePath, '/icons/apple-touch-icon.png'),
              sizes: '180x180',
              type: 'image/png'
            }
          ]
        },
        workbox: {
          disableDevLogs: true,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          // App shell offline fallback for SPA navigations (React Router basename = Vite `base`).
          navigateFallback: 'index.html',
          navigateFallbackDenylist: buildNavigateFallbackDenylist(API_BASE_URL),
          navigateFallbackAllowlist: buildNavigateFallbackAllowlist(appBaseName),
          // POST/PUT/PATCH/DELETE are intentionally omitted — see pwa/workbox-runtime-caching.mjs.
          runtimeCaching: buildRuntimeCaching(API_BASE_URL),
          importScripts: ['disable-workbox-logs.js', 'push-handlers.js']
        }
      }),
      silenceWorkboxServiceWorkerLogs(__dirname)
    ]
  };
});
