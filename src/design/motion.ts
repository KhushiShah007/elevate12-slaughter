import type { Transition, Variants } from 'framer-motion';

// Shared, light motion presets. Transforms and opacity only, so nothing shifts layout.

export const soft: Transition = { type: 'spring', stiffness: 260, damping: 26 };

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: soft },
};

export const stagger = (gap = 0.06): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: gap } },
});

// Stamp "thump": drops in big and tilted, lands with a small bounce.
export const thump: Variants = {
  hidden: { opacity: 0, scale: 1.8, rotate: -18 },
  show: {
    opacity: 1,
    scale: 1,
    rotate: -8,
    transition: { type: 'spring', stiffness: 520, damping: 18 },
  },
};

export const sheet: Variants = {
  hidden: { y: '100%' },
  show: { y: 0, transition: { type: 'spring', stiffness: 320, damping: 34 } },
  exit: { y: '100%', transition: { duration: 0.2 } },
};
