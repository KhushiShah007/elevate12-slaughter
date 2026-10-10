import { motion } from 'framer-motion';

export function Segmented<T extends string>({ value, options, onChange }: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-pill border border-line bg-sand/60 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className="relative min-h-[2.75rem] flex-1 rounded-pill text-sm font-medium text-ink"
        >
          {value === o.value && (
            <motion.span layoutId="seg" className="absolute inset-0 rounded-pill bg-paper shadow-card" transition={{ type: 'spring', stiffness: 400, damping: 34 }} />
          )}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}
