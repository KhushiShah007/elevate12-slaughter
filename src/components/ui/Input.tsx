import type { InputHTMLAttributes, ReactNode } from 'react';

export function Input({ label, icon, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; icon?: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-espresso">{label}</span>
      <span className="flex min-h-tap items-center gap-2 rounded-md border border-line bg-paper px-4 focus-within:border-ink">
        {icon && <span className="text-muted">{icon}</span>}
        <input {...rest} className="min-h-tap w-full bg-transparent text-base text-ink outline-none placeholder:text-muted/70" />
      </span>
    </label>
  );
}
