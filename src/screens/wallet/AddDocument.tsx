import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, FileUp, Hash, Lock, UserRound } from 'lucide-react';
import { PageHeader } from '../../components/layout/PageHeader';
import { Input } from '../../components/ui/Input';
import { PillButton } from '../../components/ui/PillButton';
import { Chip } from '../../components/ui/Chip';
import { useAuth } from '../../state/auth';
import { useOnline } from '../../hooks/useOnline';
import { uploadDocument } from '../../db/repos/documents';
import { ApiError } from '../../api/client';
import type { DocumentKind } from '../../types';

const kinds: { value: DocumentKind; label: string }[] = [
  { value: 'passport', label: 'Passport' },
  { value: 'id', label: 'ID card' },
  { value: 'visa', label: 'Visa' },
  { value: 'boarding-pass', label: 'Ticket' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'other', label: 'Other' },
];
const idTypes = [
  { value: 'aadhaar', label: 'Aadhaar' },
  { value: 'pan', label: 'PAN' },
  { value: 'driving_licence', label: 'Driving licence' },
  { value: 'voter', label: 'Voter ID' },
];
const MAX = 4 * 1024 * 1024;

export default function AddDocument() {
  const navigate = useNavigate();
  const online = useOnline();
  const { me } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<DocumentKind>('passport');
  const [idType, setIdType] = useState('aadhaar');
  const [title, setTitle] = useState('');
  const [holder, setHolder] = useState(me?.name ?? '');
  const [number, setNumber] = useState('');
  const [expires, setExpires] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const needsNumber = kind === 'passport' || kind === 'id';
  const label = kinds.find((k) => k.value === kind)!.label;
  const fileError = file && file.size > MAX ? 'Files can be up to 4 MB. Try a smaller photo.' : error?.fields.file;

  const save = async () => {
    if (!file || file.size > MAX) return;
    setBusy(true);
    setError(null);
    try {
      const doc = await uploadDocument(
        {
          kind,
          idType: kind === 'id' ? idType : undefined,
          title: title.trim() || (kind === 'id' ? idTypes.find((t) => t.value === idType)!.label : label),
          holder: holder.trim(),
          number: needsNumber ? number : undefined,
          expires,
        },
        file,
        file.name,
      );
      navigate(`/wallet/${doc.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, 'unknown', 'Upload failed. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pb-10">
      <PageHeader back title="Add a document" sub="Stored encrypted on your account. Only you can open it." source="cloud" />
      <div className="space-y-5 px-gutter">
        <button
          onClick={() => input.current?.click()}
          className={`flex min-h-[5.5rem] w-full items-center gap-3 rounded-lg border-2 border-dashed px-4 text-left ${fileError ? 'border-bad' : 'border-line'} bg-paper`}
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-lavender">
            <FileUp size={20} className="text-ink" />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium text-ink">{file ? file.name : 'Choose a photo or PDF'}</span>
            <span className="block text-xs text-muted">{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : 'Up to 4 MB. Take a photo or pick a file.'}</span>
          </span>
        </button>
        <input ref={input} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        {fileError && <p className="-mt-3 text-sm text-bad">{fileError}</p>}

        <div>
          <span className="mb-1.5 block text-sm font-medium text-espresso">What is it?</span>
          <div className="flex flex-wrap gap-2">
            {kinds.map((k) => (
              <button
                key={k.value}
                onClick={() => setKind(k.value)}
                aria-pressed={kind === k.value}
                className={`min-h-tap rounded-pill border px-4 text-sm ${kind === k.value ? 'border-ink bg-ink text-ivory' : 'border-line bg-paper text-ink'}`}
              >
                {k.label}
              </button>
            ))}
          </div>
        </div>
        {kind === 'id' && (
          <div className="flex flex-wrap gap-2">
            {idTypes.map((k) => (
              <button
                key={k.value}
                onClick={() => setIdType(k.value)}
                aria-pressed={idType === k.value}
                className={`min-h-tap rounded-pill border px-4 text-sm ${idType === k.value ? 'border-ink bg-butter text-ink' : 'border-line bg-paper text-ink'}`}
              >
                {k.label}
              </button>
            ))}
          </div>
        )}

        <Input label="Name" placeholder={label} value={title} onChange={(e) => setTitle(e.target.value)} error={error?.fields.title} />
        <Input label="Whose is it?" icon={<UserRound size={18} />} value={holder} onChange={(e) => setHolder(e.target.value)} />
        {needsNumber && (
          <div>
            <Input
              label="Number (optional)"
              icon={<Hash size={18} />}
              inputMode={kind === 'id' && idType === 'aadhaar' ? 'numeric' : 'text'}
              autoComplete="off"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              error={error?.fields.number}
            />
            <p className="mt-1.5 flex items-start gap-1.5 text-xs text-muted">
              <Lock size={12} className="mt-0.5 shrink-0" /> We check it, then keep only the last 4 digits. The full number is never saved.
            </p>
          </div>
        )}
        <Input label="Valid until (optional)" icon={<CalendarDays size={18} />} type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />

        {!online && (
          <Chip tone="warn" dot>
            Uploading needs internet. Scan to PDF works offline.
          </Chip>
        )}
        {error && !Object.keys(error.fields).length && <p className="text-sm text-bad">{error.message}</p>}
        <PillButton full disabled={!file || !!fileError || busy || !online} onClick={() => void save()}>
          {busy ? 'Encrypting and uploading…' : 'Save to my account'}
        </PillButton>
      </div>
    </div>
  );
}
