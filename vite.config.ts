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
  },
  optimizeDeps: {
    exclude: ['jeep-sqlite/loader'],
  },
  test: {
    environment: 'node',
    include: ['src/tests/**/*.test.ts'],
  },
});
