import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { colors } from './src/design/tokens';
import { getRequestListener } from '@hono/node-server';

/**
 * Dev only: serve /api/* from the Hono app in server/app.ts. Loaded through Vite's SSR
 * loader on every request, so edits to server code apply without a restart.
 */
function devApi(): Plugin {
  return {
    name: 'voyage-dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();
        // The app also imports shared code from api/*.ts; let Vite serve those modules.
        if (/^\/api\/[^?]*\.(ts|tsx|js|mjs)(\?|$)/.test(req.url)) return next();
        try {
          const { app } = (await server.ssrLoadModule('/server/app.ts')) as typeof import('./server/app');
          await getRequestListener(app.fetch)(req, res);
        } catch (err) {
          server.ssrFixStacktrace(err as Error);
          console.error(err);
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: { code: 'server_error', message: 'The API failed to start. See the terminal.' } }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Server-side only: no VITE_ prefix, so these never reach the browser bundle.
  // Copied into process.env so the API (server/) reads the same variables as on Vercel.
  const env = loadEnv(mode, process.cwd(), '');
  for (const [k, v] of Object.entries(env)) if (!k.startsWith('VITE_') && process.env[k] === undefined) process.env[k] = v;
  return {
    plugins: [
      react(),
      devApi(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icons/icon.svg', 'icons/apple-touch-icon.png'],
        manifest: {
          name: 'Voyage: your journey companion',
          short_name: 'Voyage',
          description: 'Plans, documents, delays and family updates. Works offline.',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'portrait',
          background_color: colors.ivory,
          theme_color: colors.ivory,
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          // Precache the whole app shell (JS, CSS, HTML, fonts, icons).
          globPatterns: ['**/*.{js,css,html,woff2,svg,png,webmanifest}'],
          // Photos are cached as they are viewed, not all up front.
          globIgnores: ['img/**'],
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname.startsWith('/img/') || url.hostname === 'upload.wikimedia.org',
              handler: 'CacheFirst',
              options: { cacheName: 'voyage-photos', expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 60 }, cacheableResponse: { statuses: [0, 200] } },
            },
          ],
          // Any in-app URL opened offline gets the shell; the router takes it from there.
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],
          cleanupOutdatedCaches: true,
        },
      }),
    ],
    server: { port: 5173 },
    build: {
      rollupOptions: {
        output: {
          // Libraries change rarely: separate files cache well and keep the app chunk small.
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            motion: ['framer-motion'],
            data: ['dexie', 'dexie-react-hooks'],
          },
        },
      },
    },
  };
});
