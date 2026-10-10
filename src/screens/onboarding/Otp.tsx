import { useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { OnboardingFrame } from './OnboardingFrame';
import { PillButton } from '../../components/ui/PillButton';
import { useSettings } from '../../state/settings';
import { logInUser } from '../../db/repos/users';
import type { AuthFlowState } from './SignUp';

const DEMO_CODE = '123456';

export default function Otp() {
  const navigate = useNavigate();
  const { update } = useSettings();
  const state = useLocation().state as AuthFlowState | null;
  const [digits, setDigits] = useState<string[]>(Array(6).fill(''));
  const [error, setError] = useState(false);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const set = (i: number, v: string) => {
    const d = v.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[i] = d;
    setDigits(next);
    setError(false);
    if (d && i < 5) refs.current[i + 1]?.focus();
  };

  if (!state) return <Navigate to="/welcome" replace />;
  const signup = state.flow === 'signup';

  const verify = async () => {
    if (digits.join('') !== DEMO_CODE) return setError(true);
    if (signup) return navigate('/set-password', { state });
    await logInUser(state.contact);
    update({ signedIn: true });
    navigate('/home', { replace: true });
  };

  return (
    <OnboardingFrame
      step={signup ? 'Step 2 of 3' : undefined}
      title="Enter the code"
      sub={`We sent a 6-digit code to ${state.contact}. In this demo the code is always 123456.`}
      footer={
        <PillButton full disabled={digits.some((d) => !d)} onClick={() => void verify()}>
          Verify
        </PillButton>
      }
    >
      <div className="flex justify-between gap-2">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => (refs.current[i] = el)}
            value={d}
            onChange={(e) => set(i, e.target.value)}
            onKeyDown={(e) => e.key === 'Backspace' && !d && i > 0 && refs.current[i - 1]?.focus()}
            inputMode="numeric"
            aria-label={`Digit ${i + 1}`}
            className={`h-14 w-full min-w-0 rounded-md border bg-paper text-center font-display text-2xl text-ink outline-none focus:border-ink ${error ? 'border-bad' : 'border-line'}`}
          />
        ))}
      </div>
      {error && <p className="mt-3 text-sm text-bad">That code does not match. Try 123456.</p>}
      <button onClick={() => setDigits(DEMO_CODE.split(''))} className="mt-6 min-h-tap text-sm font-medium text-espresso underline underline-offset-4">
        Fill demo code
      </button>
    </OnboardingFrame>
  );
}
