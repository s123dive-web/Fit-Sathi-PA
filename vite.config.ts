/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
  optimizeDeps: {
    exclude: ['jeep-sqlite/loader'],
  },
  test: {
    environment: 'node',
    include: ['src/tests/**/*.test.{ts,tsx}'],
    environmentMatchGlobs: [['src/tests/**/*.test.tsx', 'jsdom']],
    setupFiles: ['src/tests/setup.ts'],
    css: false,
  },
});
