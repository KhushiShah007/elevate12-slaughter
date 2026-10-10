export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="grid min-h-tap min-w-tap place-items-center"
    >
      <span className={`relative h-7 w-12 rounded-pill border transition ${checked ? 'border-ink bg-ink' : 'border-line bg-sand'}`}>
        <span
          className={`absolute left-0 top-0.5 h-[1.375rem] w-[1.375rem] rounded-full bg-paper shadow-card transition-transform ${checked ? 'translate-x-[1.375rem]' : 'translate-x-0.5'}`}
        />
      </span>
    </button>
  );
}
