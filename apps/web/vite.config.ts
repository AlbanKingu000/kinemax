import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin, type ProxyOptions } from 'vite';

// The browser only ever talks to the web origin; /api is proxied to the API (needed later for
// secure same-site cookies). e2e points the proxy at its own API port via API_PROXY_TARGET.
const apiTarget = process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:3001';
const proxy: Record<string, ProxyOptions> = {
  '/api': { target: apiTarget, changeOrigin: false },
};

/**
 * Preloads the two variable fonts (display + body, latin subset) in production builds, so text
 * renders in the brand fonts without waiting for the CSS to be parsed first.
 */
function preloadFonts(patterns: readonly RegExp[]): Plugin {
  let base = '/';
  return {
    name: 'kinemax-preload-fonts',
    apply: 'build',
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml: {
      order: 'post',
      handler(_html, context) {
        return Object.keys(context.bundle ?? {})
          .filter((file) => file.endsWith('.woff2') && patterns.some((p) => p.test(file)))
          .sort()
          .map((file) => ({
            tag: 'link',
            attrs: {
              rel: 'preload',
              href: base + file,
              as: 'font',
              type: 'font/woff2',
              crossorigin: '',
            },
            injectTo: 'head' as const,
          }));
      },
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    preloadFonts([/cormorant-garamond-latin-wght-normal/, /manrope-latin-wght-normal/]),
  ],
  resolve: {
    alias: {
      '@kinemax/shared': fileURLToPath(
        new URL('../../packages/shared/src/index.ts', import.meta.url),
      ),
    },
  },
  server: { port: 5180, strictPort: true, proxy },
  preview: { port: 4173, strictPort: true, proxy },
  // No source maps in production: the public repo is the source, the bundle stays minified only.
  build: { sourcemap: false },
});
