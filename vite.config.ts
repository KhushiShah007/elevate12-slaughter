import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// PWA (vite-plugin-pwa) is configured in Goal 2 along with the offline foundation.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
