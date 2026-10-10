import { RouterProvider } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { SettingsProvider } from './state/settings';
import { router } from './router';

export default function App() {
  return (
    <SettingsProvider>
      <MotionConfig reducedMotion="user">
        <RouterProvider router={router} />
      </MotionConfig>
    </SettingsProvider>
  );
}
