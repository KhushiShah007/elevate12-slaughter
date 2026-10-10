import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/fraunces/400.css';
import '@fontsource/fraunces/400-italic.css';
import '@fontsource/fraunces/600.css';
import './design/global.css';
import App from './App';
import { MotionGlobalConfig } from 'framer-motion';

// Dev only: ?noanim jumps every animation to its end state, for screenshot checks.
if (import.meta.env.DEV && new URLSearchParams(location.search).has('noanim')) {
  MotionGlobalConfig.skipAnimations = true;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
