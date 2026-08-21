import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

/**
 * Renderer build for the desktop shell.
 *
 * The activation / subscription-status screen is bundled here (dist/).
 * The main ERP UI is NOT bundled — it is served by the local NestJS backend
 * (packages/frontend build) at http://127.0.0.1:<port>/, so the whole app
 * runs from a single offline origin.
 */
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'esnext',
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'activation.html'),
    },
  },
});
