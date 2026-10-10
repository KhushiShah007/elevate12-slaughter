import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { OnboardingFrame } from './OnboardingFrame';
import { Input } from '../../components/ui/Input';
import { PillButton } from '../../components/ui/PillButton';
import { useSettings } from '../../state/settings';

export default function SetPassword() {
  const navigate = useNavigate();
  const { update } = useSettings();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const ok = pw.length >= 8 && pw === pw2;

  return (
    <OnboardingFrame
      step="Step 3 of 3 · first time only"
      title="Set a password"
      sub="So you can sign in without a code next time. At least 8 characters."
      footer={
        <PillButton
          full
          disabled={!ok}
          onClick={() => {
            update({ signedIn: true });
            navigate('/quiz');
          }}
        >
          Save and continue
        </PillButton>
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
