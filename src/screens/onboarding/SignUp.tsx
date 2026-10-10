import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserRound } from 'lucide-react';
import { OnboardingFrame } from './OnboardingFrame';
import { ContactField, isValidContact, type ContactMode } from './ContactField';
import { Input } from '../../components/ui/Input';
import { PillButton } from '../../components/ui/PillButton';
import { api, ApiError, type OtpSent } from '../../api/client';

export interface AuthFlowState {
  flow: 'signup' | 'login' | 'reset';
  name?: string;
  contact: string;
  /** Shown on screen only while no email/SMS provider is connected. */
  devCode?: string;
  /** A checked code, carried to the password step. */
  code?: string;
}

export default function SignUp() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [mode, setMode] = useState<ContactMode>('phone');
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const ok = name.trim().length > 1 && isValidContact(mode, contact);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const sent = await api<OtpSent>('POST', '/auth/otp', { contact, purpose: 'signup' });
      navigate('/otp', { state: { flow: 'signup', name: name.trim(), contact: sent.contact, devCode: sent.devCode } satisfies AuthFlowState });
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, 'unknown', 'Something went wrong. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <OnboardingFrame
      step="Step 1 of 3"
      title="Create your account"
      sub="Tell us what to call you. We will send a one-time code to check it is you."
      footer={
        <>
          {error && !error.fields.contact && <p role="alert" className="mb-3 text-center text-sm text-bad">{error.message}</p>}
          <PillButton full disabled={!ok || busy} onClick={() => void send()}>
            {busy ? 'Sending…' : 'Send code'}
          </PillButton>
          <p className="mt-4 text-center text-sm text-espresso">
            Already have an account?{' '}
            <Link to="/login" replace className="font-semibold text-ink underline underline-offset-4">
              Log in
            </Link>
          </p>
        </>
      }
    >
      <div className="space-y-5">
        <Input label="Your name" icon={<UserRound size={18} />} autoComplete="given-name" placeholder="Riya" value={name} onChange={(e) => setName(e.target.value)} />
        <ContactField mode={mode} onMode={setMode} value={contact} onChange={(v) => { setContact(v); setError(null); }} error={error?.fields.contact} />
      </div>
    </OnboardingFrame>
  );
}
