import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type ProxyOptions } from 'vite';

// The browser only ever talks to the web origin; /api is proxied to the API (needed later for
// secure same-site cookies). e2e points the proxy at its own API port via API_PROXY_TARGET.
const apiTarget = process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:3001';
const proxy: Record<string, ProxyOptions> = {
  '/api': { target: apiTarget, changeOrigin: false },
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@kinemax/shared': fileURLToPath(
        new URL('../../packages/shared/src/index.ts', import.meta.url),
      ),
    },
  },
  server: { port: 5180, strictPort: true, proxy },
  preview: { port: 4173, strictPort: true, proxy },
  build: { sourcemap: true },
});
