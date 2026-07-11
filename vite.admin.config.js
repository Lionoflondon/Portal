import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const repoRoot = new URL('.', import.meta.url).pathname;

export default defineConfig({
  root: 'admin',
  envDir: repoRoot,
  plugins: [react()],
  build: {
    outDir: '../dist-admin',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@portal': new URL('./src', import.meta.url).pathname,
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: '../src/test/setup.js',
  },
});
