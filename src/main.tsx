import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionGlobalConfig } from 'framer-motion';
import { registerSW } from 'virtual:pwa-register';
// Latin + Latin-ext only (₹ lives in Latin-ext), so the offline precache stays small.
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-ext-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-ext-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-ext-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/inter/latin-ext-700.css';
import '@fontsource/fraunces/latin-400.css';
import '@fontsource/fraunces/latin-ext-400.css';
import '@fontsource/fraunces/latin-400-italic.css';
import '@fontsource/fraunces/latin-ext-400-italic.css';
import '@fontsource/fraunces/latin-600.css';
import '@fontsource/fraunces/latin-ext-600.css';
import './design/global.css';
import App from './App';
import { ensureSeeded } from './db/seed';
import { startSync } from './db/syncQueue';
import { requestPersistentStorage } from './db/persist';

// Dev only: ?noanim jumps every animation to its end state, for screenshot checks.
if (import.meta.env.DEV && new URLSearchParams(location.search).has('noanim')) {
  MotionGlobalConfig.skipAnimations = true;
}

// Service worker precaches the app shell so Voyage opens in airplane mode.
registerSW({ immediate: true });

const root = createRoot(document.getElementById('root')!);

ensureSeeded()
  .catch((err) => console.error('Could not prepare on-device storage', err))
  .finally(() => {
    startSync();
    void requestPersistentStorage();
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
