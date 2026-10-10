import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Phone } from 'lucide-react';
import { OnboardingFrame } from './OnboardingFrame';
import { Segmented } from '../../components/ui/Segmented';
import { Input } from '../../components/ui/Input';
import { PillButton } from '../../components/ui/PillButton';

export default function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'phone' | 'email'>('phone');
  const [value, setValue] = useState('');

  return (
    <OnboardingFrame
      step="Step 1 of 3"
      title="Welcome aboard"
      sub="Sign in with your phone or email. We will send you a one-time code."
      footer={
        <>
          <PillButton full disabled={!value.trim()} onClick={() => navigate('/otp')}>
            Send code
          </PillButton>
          <p className="mt-3 text-center text-xs text-muted">
            This prototype uses a demo sign-in. The real app would use Supabase Auth or Firebase Auth.
          </p>
        </>
      }
    >
      <Segmented
        value={mode}
        onChange={(m) => {
          setMode(m);
          setValue('');
        }}
        options={[
          { value: 'phone', label: 'Phone' },
          { value: 'email', label: 'Email' },
        ]}
      />
      <div className="mt-6">
        {mode === 'phone' ? (
          <Input label="Mobile number" icon={<Phone size={18} />} type="tel" inputMode="tel" placeholder="+91 98200 00000" value={value} onChange={(e) => setValue(e.target.value)} />
        ) : (
          <Input label="Email" icon={<Mail size={18} />} type="email" placeholder="you@example.com" value={value} onChange={(e) => setValue(e.target.value)} />
        )}
      </div>
    </OnboardingFrame>
  );
}
