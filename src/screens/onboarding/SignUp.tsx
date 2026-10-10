import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserRound } from 'lucide-react';
import { OnboardingFrame } from './OnboardingFrame';
import { ContactField, isValidContact, type ContactMode } from './ContactField';
import { Input } from '../../components/ui/Input';
import { PillButton } from '../../components/ui/PillButton';

export interface AuthFlowState {
  flow: 'signup' | 'login';
  name?: string;
  contact: string;
}

export default function SignUp() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [mode, setMode] = useState<ContactMode>('phone');
  const [contact, setContact] = useState('');
  const ok = name.trim().length > 1 && isValidContact(mode, contact);

  return (
    <OnboardingFrame
      step="Step 1 of 3"
      title="Create your account"
      sub="Tell us what to call you. We will send a one-time code to check it is you."
      footer={
        <>
          <PillButton
            full
            disabled={!ok}
            onClick={() => navigate('/otp', { state: { flow: 'signup', name: name.trim(), contact: contact.trim() } satisfies AuthFlowState })}
          >
            Send code
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
        <ContactField mode={mode} onMode={setMode} value={contact} onChange={setContact} />
      </div>
    </OnboardingFrame>
  );
}
