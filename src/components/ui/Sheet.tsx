import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { sheet } from '../../design/motion';

export function Sheet({ open, onClose, title, children }: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-center">
          <motion.button
            aria-label="Close"
            className="absolute inset-0 bg-ink/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-label={title}
            variants={sheet}
            initial="hidden"
            animate="show"
            exit="exit"
            className="grain absolute bottom-0 max-h-[85vh] w-full max-w-app overflow-y-auto rounded-t-xl border border-line bg-paper px-gutter pb-8 pt-3"
          >
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line" />
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl">{title}</h2>
              <button onClick={onClose} className="grid h-tap w-tap place-items-center rounded-full hover:bg-sand" aria-label="Close">
                <X size={20} />
              </button>
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
