import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { PolaroidCollage } from '../../components/motion/PolaroidCollage';
import { PillButton } from '../../components/ui/PillButton';
import { destinationCount } from '../../data/photos';
import { fadeUp, stagger } from '../../design/motion';

export default function Welcome() {
  const navigate = useNavigate();
  return (
    <div className="relative h-[100dvh] min-h-[38rem] overflow-hidden bg-sand">
      <PolaroidCollage />

      {/* Soft fades so the wordmark and panel stay readable over the photos */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-ivory to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[66%] bg-gradient-to-t from-ivory from-55% via-ivory/90 to-transparent" />

      <div className="absolute inset-x-0 top-0 flex justify-center pt-[max(env(safe-area-inset-top),1.25rem)]">
        <span className="rounded-pill border border-line bg-paper/90 px-4 py-1.5 font-display text-xl italic text-ink shadow-card">Voyage</span>
      </div>

      <motion.div
        variants={stagger(0.08)}
        initial="hidden"
        animate="show"
        className="absolute inset-x-0 bottom-0 px-gutter pb-[max(env(safe-area-inset-bottom),1.5rem)]"
      >
        <motion.p variants={fadeUp} className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">
          {destinationCount} places · 1 calm companion
        </motion.p>
        <motion.h1 variants={fadeUp} className="mt-2 text-[2.5rem] leading-[1.05]">
          Every trip,
          <br />
          <span className="italic">beautifully looked after.</span>
        </motion.h1>
        <motion.p variants={fadeUp} className="mt-3 text-sm leading-relaxed text-espresso">
          Plans, documents, delays and family updates. Works even with no internet.
        </motion.p>

        <motion.div variants={fadeUp} className="mt-6 space-y-3">
          <PillButton full onClick={() => navigate('/signup')}>
            Create an account
          </PillButton>
          <PillButton full variant="ghost" onClick={() => navigate('/login')}>
            I already have an account
          </PillButton>
        </motion.div>

        <motion.p variants={fadeUp} className="mt-4 text-center text-[0.6875rem] text-muted">
          Photos from Wikimedia Commons.{' '}
          <button onClick={() => navigate('/credits')} className="min-h-tap underline underline-offset-4">
            Credits
          </button>
        </motion.p>
      </motion.div>
    </div>
  );
}
