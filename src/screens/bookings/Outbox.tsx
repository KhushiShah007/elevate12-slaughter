import { useEffect, useState } from 'react';
import { Mail, MessageSquare, Phone, Smartphone } from 'lucide-react';
import { PageHeader } from '../../components/layout/PageHeader';
import { Chip } from '../../components/ui/Chip';
import { api } from '../../api/client';

interface Msg {
  id: string;
  channel: 'email' | 'sms' | 'whatsapp' | 'voice' | 'push';
  toAddress: string;
  subject: string | null;
  body: string;
  status: 'dry_run' | 'sent' | 'failed';
  createdAt: string;
}

const ICON = { email: Mail, sms: MessageSquare, whatsapp: MessageSquare, voice: Phone, push: Smartphone };

/** Everything Voyage would send. In demo mode nothing leaves the app; it is listed here. */
export default function Outbox() {
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [real, setReal] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    api<{ messages: Msg[]; realSending: boolean }>('GET', '/outbox')
      .then((r) => {
        setMsgs(r.messages);
        setReal(r.realSending);
      })
      .catch(() => setMsgs([]));
  }, []);
  return (
    <div className="pb-10">
      <PageHeader back title="Outbox" sub={real ? 'Messages Voyage sent for you.' : 'Demo mode: these were not sent. They show what would go out.'} source="cloud" />
      <div className="space-y-3 px-gutter">
        {msgs?.length === 0 && <p className="text-sm text-muted">Nothing yet.</p>}
        {msgs?.map((m) => {
          const Icon = ICON[m.channel];
          return (
            <button key={m.id} onClick={() => setOpen(open === m.id ? null : m.id)} className="block w-full rounded-lg border border-line bg-paper p-4 text-left shadow-card">
              <div className="flex items-start justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <Icon size={16} className="shrink-0" />
                  <span className="truncate font-medium text-ink">{m.subject ?? m.body.slice(0, 50)}</span>
                </span>
                <Chip tone={m.status === 'sent' ? 'ok' : m.status === 'failed' ? 'bad' : 'warn'}>{m.status === 'dry_run' ? 'Not sent (demo)' : m.status}</Chip>
              </div>
              <p className="mt-1 text-xs text-muted">
                To {m.toAddress} · {new Date(m.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </p>
              {open === m.id && <pre className="mt-3 whitespace-pre-wrap font-body text-sm text-espresso">{m.body}</pre>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
