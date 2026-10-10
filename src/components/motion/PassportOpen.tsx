import { motion } from 'framer-motion';
import { Globe2 } from 'lucide-react';
import type { ReactNode } from 'react';

/** Passport cover swings open on first launch to reveal the inner page. */
export function PassportOpen({ children }: { children: ReactNode }) {
  return (
    <div className="relative mx-auto h-[26rem] w-[17.5rem]" style={{ perspective: 1400 }}>
      {/* Inner page */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9, duration: 0.5 }}
        className="grain absolute inset-0 flex flex-col items-center justify-center rounded-r-lg rounded-l-sm border border-line bg-paper p-6 shadow-lift"
      >
        {children}
      </motion.div>

      {/* Cover */}
      <motion.div
        initial={{ rotateY: 0 }}
        animate={{ rotateY: -168 }}
        transition={{ delay: 0.5, duration: 1.3, ease: [0.65, 0, 0.35, 1] }}
        style={{ transformOrigin: 'left center', transformStyle: 'preserve-3d', backfaceVisibility: 'hidden' }}
        className="absolute inset-0 flex flex-col items-center justify-between rounded-r-lg rounded-l-sm bg-espresso py-12 text-gold shadow-lift"
      >
        <span className="text-xs font-semibold uppercase tracking-[0.4em]">Passport</span>
        <Globe2 size={72} strokeWidth={1} />
        <span className="font-display text-3xl italic">Voyage</span>
      </motion.div>
    </div>
  );
}
