import { useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { OnboardingFrame } from './OnboardingFrame';
import { PillButton } from '../../components/ui/PillButton';
import { DEMO_OTP, useAuth } from '../../state/auth';
import { ApiError } from '../../api/client';
import type { AuthFlowState } from './SignUp';

export default function Otp() {
  const navigate = useNavigate();
  const auth = useAuth();
  const initial = useLocation().state as AuthFlowState | null;
  const [state, setState] = useState(initial);
  const [digits, setDigits] = useState<string[]>(Array(6).fill(''));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resent, setResent] = useState(false);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const set = (i: number, v: string) => {
    const typed = v.replace(/\D/g, '');
    // A pasted or auto-filled code fills every box.
    if (typed.length === 6) {
      setDigits(typed.split(''));
      setError(null);
      refs.current[5]?.focus();
      return;
    }
    const d = typed.slice(-1);
    const next = [...digits];
    next[i] = d;
    setDigits(next);
    setError(null);
    if (d && i < 5) refs.current[i + 1]?.focus();
  };

  if (!state) return <Navigate to="/welcome" replace />;
  const { flow, contact } = state;

  const verify = async () => {
    const code = digits.join('');
    setBusy(true);
    setError(null);
    try {
      // Demo: no server. 123456 signs in on this device and goes straight to Home.
      if (code !== DEMO_OTP) throw new Error('Use the code 123456.');
      await auth.demoSignIn(contact, state.name);
      navigate('/home', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? (err.fields.code ?? err.message) : (err as Error).message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError(null);
    try {
      setState({ ...state, devCode: DEMO_OTP });
      setDigits(Array(6).fill(''));
      setResent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send a new code.');
    }
  };

  return (
    <OnboardingFrame
      step={flow === 'signup' ? 'Step 2 of 3' : undefined}
      title="Enter the code"
      sub={`We made a 6-digit code for ${contact}. It works for 10 minutes.`}
      footer={
        <PillButton full disabled={digits.some((d) => !d) || busy} onClick={() => void verify()}>
          {busy ? 'Checking…' : 'Verify'}
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
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            aria-label={`Digit ${i + 1}`}
            className={`h-14 w-full min-w-0 rounded-md border bg-paper text-center font-display text-2xl text-ink outline-none focus:border-ink ${error ? 'border-bad' : 'border-line'}`}
          />
        ))}
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-bad">{error}</p>}

      {state.devCode && (
        // Honest about the gap: no email/SMS service is connected yet, so the code is shown here.
        <div className="mt-6 rounded-md border border-warn/40 bg-butter px-4 py-3 text-sm text-ink">
          <p>Email and SMS sending is not connected yet, so here is your code: <span className="font-display text-lg tracking-widest">{state.devCode}</span></p>
          <button onClick={() => setDigits(state.devCode!.split(''))} className="mt-1 min-h-tap font-medium text-espresso underline underline-offset-4">
            Fill the code
          </button>
        </div>
      )}
      <button onClick={() => void resend()} className="mt-4 min-h-tap text-sm font-medium text-espresso underline underline-offset-4">
        {resent ? 'New code made. Send another' : 'Send a new code'}
      </button>
    </OnboardingFrame>
  );
}
