import { RouterProvider } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { SettingsProvider } from './state/settings';
import { AuthProvider } from './state/auth';
import { router } from './router';
import { useDocumentLanguage } from './i18n';

function LanguageSync() {
  useDocumentLanguage();
  return null;
}

export default function App() {
  return (
    <SettingsProvider>
      <AuthProvider>
        <LanguageSync />
        <MotionConfig reducedMotion="user">
          <RouterProvider router={router} future={{ v7_startTransition: true }} />
        </MotionConfig>
      </AuthProvider>
    </SettingsProvider>
  );
}
