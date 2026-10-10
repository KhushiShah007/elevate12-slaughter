import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { OnboardingFrame } from './OnboardingFrame';
import { ContactField, isValidContact, type ContactMode } from './ContactField';
import type { AuthFlowState } from './SignUp';
import { Input } from '../../components/ui/Input';
import { PillButton } from '../../components/ui/PillButton';
import { useSettings } from '../../state/settings';

export default function Login() {
  const navigate = useNavigate();
  const { update, profile } = useSettings();
  const [mode, setMode] = useState<ContactMode>('phone');
  const [contact, setContact] = useState('');
  const [password, setPassword] = useState('');
  const validContact = isValidContact(mode, contact);

  // Demo: the password is not checked against a server. Production uses Supabase Auth or Firebase Auth.
  const logIn = () => {
    update({ signedIn: true, profile: profile ?? { name: 'Riya', contact: contact.trim() } });
    navigate('/home', { replace: true });
  };

  return (
    <OnboardingFrame
      title="Welcome back"
      sub="Log in with your phone or email and password."
      footer={
        <>
          <PillButton full disabled={!validContact || password.length < 8} onClick={logIn}>
            Log in
          </PillButton>
          <PillButton
            full
            variant="ghost"
            className="mt-3"
            disabled={!validContact}
            onClick={() => navigate('/otp', { state: { flow: 'login', contact: contact.trim() } satisfies AuthFlowState })}
          >
            Use a one-time code instead
          </PillButton>
          <p className="mt-4 text-center text-sm text-espresso">
            New to Voyage?{' '}
            <Link to="/signup" replace className="font-semibold text-ink underline underline-offset-4">
              Create an account
            </Link>
          </p>
          <p className="mt-3 text-center text-xs text-muted">Demo sign-in: the password is not checked. The real app would use Supabase Auth or Firebase Auth.</p>
        </>
      }
    >
      <div className="space-y-5">
        <ContactField mode={mode} onMode={setMode} value={contact} onChange={setContact} />
        <Input label="Password" icon={<Lock size={18} />} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
    </OnboardingFrame>
  );
}
