import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'ghost' | 'danger' | 'soft';

const variants: Record<Variant, string> = {
  primary: 'bg-ink text-ivory hover:bg-espresso',
  ghost: 'bg-paper text-ink border border-line hover:bg-sand/60',
  danger: 'bg-bad text-paper hover:brightness-95',
  soft: 'bg-sand text-ink hover:bg-line',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  full?: boolean;
  icon?: ReactNode;
  small?: boolean;
}

export function PillButton({ variant = 'primary', full, icon, small, className = '', children, ...rest }: Props) {
  return (
    <button
      type="button"
      {...rest}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-pill font-medium transition active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100',
        small ? 'min-h-tap px-4 text-sm' : 'min-h-tap px-6 text-base',
        full ? 'w-full' : '',
        variants[variant],
        className,
      ].join(' ')}
    >
      {icon}
      {children}
    </button>
  );
}
