import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { OnboardingFrame } from './OnboardingFrame';
import { ContactField, isValidContact, type ContactMode } from './ContactField';
import type { AuthFlowState } from './SignUp';
import { Input } from '../../components/ui/Input';
import { PillButton } from '../../components/ui/PillButton';
import { DEMO_OTP, useAuth } from '../../state/auth';
import { ApiError } from '../../api/client';

export default function Login() {
  const navigate = useNavigate();
  const auth = useAuth();
  const [mode, setMode] = useState<ContactMode>('phone');
  const [contact, setContact] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const validContact = isValidContact(mode, contact);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, 'unknown', 'Something went wrong. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  const logIn = () =>
    run(async () => {
      // Demo: no server. Any contact and password sign in on this device.
      await auth.demoSignIn(contact);
      navigate('/home', { replace: true });
    });

  const sendCode = (flow: 'login' | 'reset') =>
    run(async () => {
      navigate('/otp', { state: { flow, contact, devCode: DEMO_OTP } satisfies AuthFlowState });
    });

  return (
    <OnboardingFrame
      title="Welcome back"
      sub="Log in with your phone or email and password."
      footer={
        <>
          {error && !error.fields.contact && <p role="alert" className="mb-3 text-center text-sm text-bad">{error.message}</p>}
          <PillButton full disabled={!validContact || busy} onClick={() => void logIn()}>
            {busy ? 'Please wait…' : 'Log in'}
          </PillButton>
          <PillButton
            full
            variant="ghost"
            className="mt-3"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await auth.demoSignIn();
                navigate('/home', { replace: true });
              })
            }
          >
            Continue as demo
          </PillButton>
          <PillButton full variant="ghost" className="mt-3" disabled={!validContact || busy} onClick={() => void sendCode('login')}>
            Use a one-time code instead
          </PillButton>
          <p className="mt-4 text-center text-sm text-espresso">
            New to Voyage?{' '}
            <Link to="/signup" replace className="font-semibold text-ink underline underline-offset-4">
              Create an account
            </Link>
          </p>
        </>
      }
    >
      <div className="space-y-5">
        <ContactField mode={mode} onMode={setMode} value={contact} onChange={(v) => { setContact(v); setError(null); }} error={error?.fields.contact} />
        <Input label="Password" icon={<Lock size={18} />} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button
          type="button"
          disabled={!validContact || busy}
          onClick={() => void sendCode('reset')}
          className="min-h-tap text-sm font-medium text-espresso underline underline-offset-4 disabled:opacity-50"
        >
          Forgot password?
        </button>
      </div>
    </OnboardingFrame>
  );
}
