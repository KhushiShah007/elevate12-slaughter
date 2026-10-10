import { motion } from 'framer-motion';
import { thump } from '../../design/motion';

const tones = {
  ok: 'border-ok text-ok',
  bad: 'border-bad text-bad',
  ink: 'border-espresso text-espresso',
};

/** Round ink stamp that "thumps" onto the page when it mounts. */
export function StampThump({ label, sub, tone = 'ok', size = 'md' }: {
  label: string;
  sub?: string;
  tone?: keyof typeof tones;
  size?: 'sm' | 'md' | 'lg';
}) {
  const dims = { sm: 'h-12 w-12 text-[0.55rem]', md: 'h-20 w-20 text-xs', lg: 'h-32 w-32 text-sm' }[size];
  return (
    <motion.div
      variants={thump}
      initial="hidden"
      animate="show"
      className={`grid shrink-0 place-items-center rounded-full border-[3px] border-double font-bold uppercase tracking-widest opacity-90 ${dims} ${tones[tone]}`}
    >
      <span className="text-center leading-tight">
        {label}
        {sub && <span className="mt-0.5 block text-[0.7em] font-semibold tracking-normal">{sub}</span>}
      </span>
    </motion.div>
  );
}
