import { Mail, Phone } from 'lucide-react';
import { Segmented } from '../../components/ui/Segmented';
import { Input } from '../../components/ui/Input';

export type ContactMode = 'phone' | 'email';

/** Phone-or-email switch with the matching input. */
export function ContactField({ mode, onMode, value, onChange, error }: {
  mode: ContactMode;
  onMode: (m: ContactMode) => void;
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  return (
    <div className="space-y-4">
      <Segmented
        value={mode}
        onChange={(m) => {
          onMode(m);
          onChange('');
        }}
        options={[
          { value: 'phone', label: 'Phone' },
          { value: 'email', label: 'Email' },
        ]}
      />
      {mode === 'phone' ? (
        <Input label="Mobile number" icon={<Phone size={18} />} type="tel" inputMode="tel" autoComplete="tel" placeholder="+91 98200 00000" value={value} onChange={(e) => onChange(e.target.value)} error={error} />
      ) : (
        <Input label="Email" icon={<Mail size={18} />} type="email" autoComplete="email" placeholder="you@example.com" value={value} onChange={(e) => onChange(e.target.value)} error={error} />
      )}
    </div>
  );
}

export function isValidContact(mode: ContactMode, v: string) {
  return mode === 'phone' ? v.replace(/\D/g, '').length >= 10 : /^\S+@\S+\.\S+$/.test(v.trim());
}
