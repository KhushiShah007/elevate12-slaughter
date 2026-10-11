import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Trash2 } from 'lucide-react';
import { PageHeader } from '../../components/layout/PageHeader';
import { api, ApiError } from '../../api/client';
import { useAuth } from '../../state/auth';
import { useSettings } from '../../state/settings';

/** Privacy notice, data export and account deletion. */
export default function Privacy() {
  const navigate = useNavigate();
  const auth = useAuth();
  const settings = useSettings();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirm, setConfirm] = useState('');
  const [password, setPassword] = useState('');

  const download = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/account/export', { credentials: 'same-origin' });
      if (!res.ok) throw new Error();
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `voyage-my-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setMsg('Could not prepare your data. Try again online.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api('POST', '/account/delete', { confirm, password: password || undefined });
      await auth.signOut();
      settings.reset();
      navigate('/welcome', { replace: true });
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : 'Could not delete the account. Try again.');
      setBusy(false);
    }
  };

  return (
    <div className="pb-10">
      <PageHeader back="/me" title="Privacy and your data" />
      <div className="space-y-6 px-gutter text-sm text-espresso">
        <section className="space-y-2 rounded-md border border-line bg-paper p-4">
          <h2 className="text-lg text-ink">What we keep, and why</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Your account (mobile or email, name, password hash) to sign you in.</li>
            <li>Trips, bookings, itineraries and packing lists, so they sync across your devices.</li>
            <li>Documents are encrypted. ID numbers are checked and then cut to the last 4 digits; masked copies hide the rest.</li>
            <li>Payments run in test mode through Razorpay. Card details never reach Voyage.</li>
            <li>Emails, SMS, WhatsApp and calls go out only on channels you switch on. In this demo they are logged to your Outbox instead.</li>
            <li>The assistant sends your messages to an AI provider (xAI or Groq) to answer them, when one is set up.</li>
            <li>Nothing is cancelled, sent or paid without your tap.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg text-ink">Download my data</h2>
          <p>Everything stored for your account, as a JSON file. Document files are not included; save them from your wallet.</p>
          <button type="button" disabled={busy} onClick={() => void download()} className="flex min-h-tap items-center gap-2 rounded-pill border border-line bg-paper px-5 text-ink disabled:opacity-60">
            <Download size={16} /> Download
          </button>
        </section>

        <section className="space-y-2 rounded-md border border-bad/30 bg-paper p-4">
          <h2 className="text-lg text-bad">Delete my account</h2>
          <p>Deletes your account, trips, bookings, documents, chats and notifications for good. Refunds already in progress with providers continue with them.</p>
          <label className="block">
            Type DELETE to confirm
            <input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" className="mt-1 min-h-tap w-full rounded-md border border-line bg-paper px-3" />
          </label>
          <label className="block">
            Your password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className="mt-1 min-h-tap w-full rounded-md border border-line bg-paper px-3" />
          </label>
          <button type="button" disabled={busy || confirm !== 'DELETE'} onClick={() => void remove()} className="flex min-h-tap items-center gap-2 rounded-pill bg-bad px-5 font-medium text-paper disabled:opacity-50">
            <Trash2 size={16} /> Delete for good
          </button>
        </section>
        {msg && <p className="text-bad">{msg}</p>}
      </div>
    </div>
  );
}
