import { motion } from 'framer-motion';
import { Plane } from 'lucide-react';

/** A plane gliding along a dotted route line. */
export function PlaneOnDottedLine({ label }: { label?: string }) {
  return (
    <div className="relative flex-1 px-1">
      <div className="relative h-7">
        <div className="absolute inset-x-0 top-1/2 border-t-2 border-dotted border-espresso/30" />
        <motion.span
          className="absolute top-1/2 -translate-y-1/2 text-ink"
          initial={{ left: '0%' }}
          animate={{ left: ['0%', '88%'] }}
          transition={{ duration: 5, ease: 'easeInOut', repeat: Infinity, repeatType: 'reverse', repeatDelay: 1.2 }}
        >
          <Plane size={20} className="rotate-45" fill="currentColor" />
        </motion.span>
      </div>
      {label && <p className="text-center text-[0.6875rem] text-muted">{label}</p>}
    </div>
  );
}
