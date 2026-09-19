import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfigFn from './vite.config.mjs';

const viteConfig = typeof viteConfigFn === 'function' ? viteConfigFn({ mode: 'test' }) : viteConfigFn;

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setupTests.js'],
      include: ['src/**/*.{test,spec}.{js,jsx}']
    }
  })
);
