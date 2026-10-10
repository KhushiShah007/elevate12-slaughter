import type { InputHTMLAttributes, ReactNode } from 'react';

export function Input({ label, icon, error, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; icon?: ReactNode; error?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-espresso">{label}</span>
      <span className={`flex min-h-tap items-center gap-2 rounded-md border bg-paper px-4 focus-within:border-ink ${error ? 'border-bad' : 'border-line'}`}>
        {icon && <span className="text-muted">{icon}</span>}
        <input {...rest} aria-invalid={error ? true : undefined} className="min-h-tap w-full bg-transparent text-base text-ink outline-none placeholder:text-muted/70" />
      </span>
      {error && (
        <span role="alert" className="mt-1.5 block text-sm text-bad">
          {error}
        </span>
      )}
    </label>
  );
}
