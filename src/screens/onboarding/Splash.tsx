import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { PassportOpen } from '../../components/motion/PassportOpen';
import { StampThump } from '../../components/motion/StampThump';
import { PillButton } from '../../components/ui/PillButton';
import { useAuth } from '../../state/auth';

export default function Splash() {
  const navigate = useNavigate();
  const signedIn = useAuth().status === 'signedIn';
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-10 px-gutter py-12">
      <PassportOpen>
        <p className="text-[0.625rem] font-semibold uppercase tracking-[0.35em] text-muted">Your journey companion</p>
        <h1 className="mt-3 font-display text-5xl italic">Voyage</h1>
        <p className="mt-3 text-center text-sm leading-relaxed text-espresso">
          Plans, documents, delays and family updates. All in one calm place.
        </p>
        <div className="mt-6">
          <StampThump label="Bon" sub="voyage" tone="ink" />
        </div>
      </PassportOpen>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.6 }} className="w-full">
        <PillButton full onClick={() => navigate(signedIn ? '/home' : '/welcome')}>
          {signedIn ? 'Continue' : 'Begin your journey'}
        </PillButton>
      </motion.div>
    </div>
  );
}
