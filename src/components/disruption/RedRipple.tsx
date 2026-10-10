import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

/** Red rings spreading out from the point where the trouble started. */
export function RedRipple({ children }: { children: ReactNode }) {
  return (
    <span className="relative grid h-11 w-11 shrink-0 place-items-center">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="absolute inset-0 rounded-full border-2 border-bad"
          initial={{ scale: 0.6, opacity: 0.7 }}
          animate={{ scale: 2.2, opacity: 0 }}
          transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.8, ease: 'easeOut' }}
        />
      ))}
      <span className="relative grid h-11 w-11 place-items-center rounded-full bg-bad text-paper">{children}</span>
    </span>
  );
}
