import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowUp, ArrowUpRight, Mic } from 'lucide-react';
import { PageHeader } from '../../components/layout/PageHeader';
import { Chip } from '../../components/ui/Chip';
import { useTraveller } from '../../hooks/useTrip';

interface Msg {
  from: 'me' | 'voyage';
  text: string;
  action?: { label: string; to: string };
}

// Prototype: canned replies for the suggestion chips. Goal 5 adds the on-device
// keyword matcher and the Gemini intent call with fallback.
const suggestions: { text: string; reply: Msg }[] = [
  {
    text: 'Meri flight late hai, connection miss hoga kya?',
    reply: {
      from: 'voyage',
      text: 'AI 865 abhi on time hai. Delay hote hi yahan dikh jayega kya kya affect hoga aur best option kaunsa hai.',
      action: { label: 'Open flight delay help', to: '/trips/t-japan/disruption/delay' },
    },
  },
  {
    text: 'Show my boarding pass',
    reply: { from: 'voyage', text: 'Here is your AI 865 boarding pass. It is saved on this phone, so it works offline.', action: { label: 'Open boarding pass', to: '/wallet/doc3' } },
  },
  {
    text: 'Delhi mein layover pe kya karun?',
    reply: { from: 'voyage', text: 'Aapke paas 3 h 20 m hain. Lounge Gate 11 ke paas hai, aur veg breakfast bhi mil jayega.', action: { label: 'Open layover help', to: '/trips/t-japan/disruption/layover' } },
  },
];

export default function Assistant() {
  const { name } = useTraveller();
  const [msgs, setMsgs] = useState<Msg[]>([
    { from: 'voyage', text: `Namaste ${name}! Ask me anything about your trip, in English, Hindi or Hinglish.` },
  ]);
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [msgs]);

  const send = (t: string) => {
    if (!t.trim()) return;
    const match = suggestions.find((s) => s.text === t);
    setMsgs((m) => [
      ...m,
      { from: 'me', text: t },
      match?.reply ?? { from: 'voyage', text: 'Sample reply: free-text understanding arrives with the assistant build. Try one of the suggestions below.' },
    ]);
    setText('');
  };

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col">
      <PageHeader title="Assistant" sub="Type or speak. Hinglish works." source="cloud" right={<Chip>Falls back on-device</Chip>} />

      <div className="flex-1 space-y-3 px-gutter">
        {msgs.map((m, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`max-w-[85%] rounded-lg px-4 py-3 text-[0.9375rem] leading-relaxed ${
              m.from === 'me' ? 'ml-auto rounded-br-sm bg-ink text-ivory' : 'rounded-bl-sm border border-line bg-paper text-ink'
            }`}
          >
            {m.text}
            {m.action && (
              <Link to={m.action.to} className="mt-3 flex min-h-[2.75rem] items-center justify-between rounded-pill bg-lavender px-4 text-sm font-medium text-ink">
                {m.action.label} <ArrowUpRight size={16} />
              </Link>
            )}
          </motion.div>
        ))}
        <div ref={end} />
      </div>

      <div className="sticky bottom-28 bg-gradient-to-t from-ivory via-ivory to-transparent px-gutter pb-2 pt-6">
        <div className="no-scrollbar -mx-gutter mb-3 flex gap-2 overflow-x-auto px-gutter">
          {suggestions.map((s) => (
            <button key={s.text} onClick={() => send(s.text)} className="min-h-[2.5rem] shrink-0 rounded-pill border border-line bg-paper px-4 text-sm text-espresso">
              {s.text}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(text);
          }}
          className="flex items-center gap-2 rounded-pill border border-line bg-paper p-1.5 pl-2 shadow-card"
        >
          <button type="button" aria-label="Speak" className="grid h-tap w-tap shrink-0 place-items-center rounded-full bg-rose text-ink">
            <Mic size={20} />
          </button>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Kuch bhi poocho…"
            className="min-h-tap min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-muted/70"
          />
          <button type="submit" aria-label="Send" className="grid h-tap w-tap shrink-0 place-items-center rounded-full bg-ink text-ivory">
            <ArrowUp size={20} />
          </button>
        </form>
      </div>
    </div>
  );
}
