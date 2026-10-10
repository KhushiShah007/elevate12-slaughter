import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { OnboardingFrame } from './OnboardingFrame';
import { Input } from '../../components/ui/Input';
import { PillButton } from '../../components/ui/PillButton';
import { useAuth } from '../../state/auth';
import { api, ApiError, type Me } from '../../api/client';
import type { AuthFlowState } from './SignUp';

export default function SetPassword() {
  const navigate = useNavigate();
  const auth = useAuth();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const state = useLocation().state as AuthFlowState | null;
  const ok = pw.length >= 8 && pw === pw2;
  if (!state?.code || (state.flow === 'signup' && !state.name)) return <Navigate to="/welcome" replace />;
  const reset = state.flow === 'reset';

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = reset
        ? await api<{ me: Me }>('POST', '/auth/reset', { contact: state.contact, code: state.code, password: pw })
        : await api<{ me: Me }>('POST', '/auth/signup', { name: state.name, contact: state.contact, code: state.code, password: pw });
      await auth.signedIn(res.me);
      navigate(reset ? '/home' : '/quiz', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? (err.fields.password ?? err.message) : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <OnboardingFrame
      step={reset ? undefined : 'Step 3 of 3 · first time only'}
      title={reset ? 'Choose a new password' : 'Set a password'}
      sub={reset ? 'At least 8 characters. Other devices will be signed out.' : 'So you can sign in without a code next time. At least 8 characters.'}
      footer={
        <>
          {error && <p role="alert" className="mb-3 text-center text-sm text-bad">{error}</p>}
          <PillButton full disabled={!ok || busy} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save and continue'}
          </PillButton>
        </>
      }
    >
      <div className="space-y-4">
        <Input label="Password" icon={<Lock size={18} />} type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        <Input label="Repeat password" icon={<Lock size={18} />} type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        {pw2 && pw !== pw2 && <p className="text-sm text-bad">Passwords do not match.</p>}
      </div>
    </OnboardingFrame>
  );
}
