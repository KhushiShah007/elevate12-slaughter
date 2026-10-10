import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { colors } from './src/design/tokens';

export default defineConfig({
  plugins: [
    react(),
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
});
