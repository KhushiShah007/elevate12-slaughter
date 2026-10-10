import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { colors } from './src/design/tokens';
import { handleAi, type AiEnv } from './api/_ai';

/** Dev only: serve POST /api/ai like the Vercel function, with the key from .env.local. */
function devApi(env: AiEnv): Plugin {
  return {
    name: 'voyage-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/ai', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        let raw = '';
        req.on('data', (c) => (raw += c));
        req.on('end', async () => {
          let body: unknown = null;
          try {
            body = JSON.parse(raw);
          } catch {
            /* handled as a bad request */
          }
          const out = await handleAi(body, env);
          res.statusCode = out.status;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(out.json));
        });
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Server-side only: no VITE_ prefix, so these never reach the browser bundle.
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [
      react(),
      devApi({ GROQ_API_KEY: env.GROQ_API_KEY, GROQ_MODEL: env.GROQ_MODEL }),
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
