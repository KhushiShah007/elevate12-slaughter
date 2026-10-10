import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Input } from '../ui/Input';
import { api } from '../../api/client';

export interface Airport {
  iata: string;
  name: string;
  city: string;
  country: string;
}

/** Airport picker: type a city or code, pick from suggestions. The value is the IATA code. */
export function AirportField({ label, icon, value, onChange, error }: {
  label: string;
  icon?: ReactNode;
  value: string;
  onChange: (iata: string) => void;
  error?: string;
}) {
  const listId = useId();
  const [text, setText] = useState(value);
  const [options, setOptions] = useState<Airport[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => setText(value), [value]);

  const lookup = (q: string) => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) return setOptions([]);
    timer.current = setTimeout(() => {
      api<{ airports: Airport[] }>('GET', `/airports?q=${encodeURIComponent(q.trim())}`)
        .then((r) => setOptions(r.airports))
        .catch(() => setOptions([]));
    }, 200);
  };

  return (
    <>
      <Input
        label={label}
        icon={icon}
        list={listId}
        value={text}
        placeholder="City or code"
        autoComplete="off"
        error={error}
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          // Picking a suggestion fills "BOM · Mumbai"; a typed 3-letter code also counts.
          const code = v.match(/^([A-Za-z]{3})(\s·|$)/)?.[1]?.toUpperCase();
          if (code && (v.includes('·') || options.some((o) => o.iata === code))) onChange(code);
          else {
            onChange('');
            lookup(v);
          }
        }}
        onBlur={() => {
          // Typed a city and left the field: take the best match.
          if (!value && options[0]) {
            onChange(options[0].iata);
            setText(`${options[0].iata} · ${options[0].city}`);
          }
        }}
      />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o.iata} value={`${o.iata} · ${o.city}`}>
            {o.name}, {o.country}
          </option>
        ))}
      </datalist>
    </>
  );
}

/** Best airport for a city name (e.g. the traveller's home city), or null. */
export async function airportForCity(city: string): Promise<Airport | null> {
  if (city.trim().length < 2) return null;
  try {
    const { airports } = await api<{ airports: Airport[] }>('GET', `/airports?q=${encodeURIComponent(city.trim())}`);
    return airports[0] ?? null;
  } catch {
    return null;
  }
}
