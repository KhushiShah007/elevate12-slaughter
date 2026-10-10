import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowUp, ArrowUpRight, History, Mic, Plus, Smartphone, Sparkles, Square, Trash2, Volume2, VolumeX } from 'lucide-react';
import { Sheet } from '../../components/ui/Sheet';
import { PageHeader } from '../../components/layout/PageHeader';
import { Chip } from '../../components/ui/Chip';
import { useNextFlight, useTraveller, useTrip, useTrips } from '../../hooks/useTrip';
import { usePoints } from '../../hooks/usePoints';
import { useOnline } from '../../hooks/useOnline';
import { isMuted, setMuted, speak, stopSpeaking, useSpeaking, useVoiceInput } from '../../hooks/useSpeech';
import { languageInfo, useT, type MessageKey, type Params } from '../../i18n';
import { useSettings } from '../../state/settings';
import { useAuth } from '../../state/auth';
import { understand } from '../../ai/intent';
import { languageRequest } from '../../engines/intentMatcher';
import { planReply, type AssistantAction, type AssistantContext } from '../../engines/assistantPlan';
import { setDelay, setPrepone } from '../../db/repos/status';
import { api } from '../../api/client';
import { loadDestinations } from '../../hooks/useDestinations';
import { clock } from '../../utils/format';
import type { Intent } from '../../../api/_guard';

interface Link {
  label: string;
  to: string;
}

type Msg =
  | { id: number; from: 'me'; text: string }
  | {
      id: number;
      from: 'voyage';
      /** On-device replies are message keys (they re-translate); AI replies are text. */
      reply?: MessageKey;
      text?: string;
      params?: Params;
      paramKeys?: Record<string, MessageKey>;
      actions?: AssistantAction[];
      links?: Link[];
      source?: 'device' | 'ai';
      provider?: string;
      suggest?: boolean;
      note?: MessageKey;
      noteText?: string;
    };

const SUGGESTIONS: MessageKey[] = ['asst.suggest.delay', 'asst.suggest.boarding', 'asst.suggest.layover', 'asst.suggest.missed'];
const NEEDS_FLIGHT: Intent[] = ['delay', 'missed', 'connecting', 'layover', 'preponed', 'boardingPass', 'nextFlight', 'family'];
const providerName = (p: string | null | undefined) => (p === 'grok' ? 'Grok' : p === 'groq' ? 'Groq' : p === 'rules' ? 'Voyage’s built-in assistant' : 'AI');

// The conversation survives tapping an 'Open' button and coming back; AI chats are also
// saved on the account and reopened from there.
const CHAT_KEY = 'voyage.chat';
const CONV_KEY = 'voyage.chatConversation';
function loadChat(): Msg[] {
  try {
    return JSON.parse(sessionStorage.getItem(CHAT_KEY) ?? '[]') as Msg[];
  } catch {
    return [];
  }
}
const readConv = () => {
  try {
    return localStorage.getItem(CONV_KEY);
  } catch {
    return null;
  }
};
const writeConv = (id: string | null) => {
  try {
    if (id) localStorage.setItem(CONV_KEY, id);
    else localStorage.removeItem(CONV_KEY);
  } catch {
    /* storage blocked */
  }
};

let nextId = Math.max(0, ...loadChat().map((m) => m.id)) + 1;

export default function Assistant() {
  const navigate = useNavigate();
  const online = useOnline();
  const { t, info, lang } = useT();
  const settings = useSettings();
  const { me } = useAuth();
  const traveller = useTraveller();
  const next = useNextFlight();
  const bundle = useTrip(next?.trip.id);
  const trips = useTrips();
  const points = usePoints();
  const [msgs, setMsgs] = useState<Msg[]>(loadChat);
  const [text, setText] = useState('');
  const [thinking, setThinking] = useState(false);
  const [provider, setProvider] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(readConv);
  const [looking, setLooking] = useState<string | null>(null);
  const [chats, setChats] = useState<{ id: string; title: string; updatedAt: string }[] | null>(null);
  const [muted, setMutedState] = useState(isMuted);
  const speaking = useSpeaking();
  const spokenRef = useRef(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [msgs, thinking]);

  useEffect(() => {
    try {
      sessionStorage.setItem(CHAT_KEY, JSON.stringify(msgs.slice(-40)));
    } catch {
      /* storage blocked: the chat just won't survive navigation */
    }
  }, [msgs]);

  // Is an AI connected? And reopen the saved conversation (e.g. on another device).
  useEffect(() => {
    if (!online) return;
    api<{ provider: string | null }>('GET', '/assistant/status')
      .then((r) => setProvider(r.provider))
      .catch(() => setProvider(null));
    const id = readConv();
    if (id && loadChat().length === 0) {
      api<{ messages: { role: string; text: string; links: Link[] }[] }>('GET', `/assistant/conversations/${id}`)
        .then((r) =>
          setMsgs(r.messages.map((m) => (m.role === 'user' ? { id: nextId++, from: 'me' as const, text: m.text } : { id: nextId++, from: 'voyage' as const, text: m.text, links: m.links, source: 'ai' as const }))),
        )
        .catch(() => {
          writeConv(null);
          setConversationId(null);
        });
    }
  }, [online]);

  // What the on-device assistant knows about: the next flight, else the first upcoming trip.
  const firstTrip = trips?.existing[0];
  const ctx: AssistantContext | null =
    next && bundle
      ? {
          tripId: next.trip.id,
          flightId: next.leg.id,
          flightNo: next.leg.flightNo,
          departs: clock(next.leg.depart),
          risk: next.risk,
          hasConnection: !!next.onward,
          boardingPassDocId: bundle.documents.find((d) => d.kind === 'boarding-pass')?.id ?? null,
          points: points?.total ?? 0,
        }
      : firstTrip
        ? { tripId: firstTrip.id, flightId: '', flightNo: '', departs: '', risk: 'ok', hasConnection: false, boardingPassDocId: null, points: points?.total ?? 0 }
        : null;

  const answerOnDevice = useCallback(
    async (said: string, note?: MessageKey) => {
      const u = await understand(said);
      const hasFlight = !!ctx?.flightId;
      if (NEEDS_FLIGHT.includes(u.intent) && !hasFlight) {
        setMsgs((m) => [...m, { id: nextId++, from: 'voyage', reply: 'asst.noFlight', actions: [{ label: 'asst.action.open', to: '/trips/new' }], source: 'device', note }]);
        return;
      }
      // A destination named in the message ("weather in Goa", "Jaipur kaisa hai"): open its page.
      if (u.intent === 'unknown') {
        const list = await loadDestinations().catch(() => []);
        const lower = said.toLowerCase();
        const place = list.find((d) => lower.includes(d.name.toLowerCase()));
        if (place) {
          setMsgs((m) => [...m, { id: nextId++, from: 'voyage', reply: 'asst.reply.destination', params: { place: place.name }, actions: [{ label: 'asst.action.open', to: `/destinations/${place.slug}` }], source: 'device', note }]);
          return;
        }
      }
      const plan = ctx ? planReply(u.intent, u.minutes, ctx) : u.intent === 'documents' ? planReply(u.intent, null, { tripId: '', flightId: '', flightNo: '', departs: '', risk: 'ok', hasConnection: false, boardingPassDocId: null, points: points?.total ?? 0 }) : null;
      setMsgs((m) => [
        ...m,
        plan
          ? { id: nextId++, from: 'voyage', reply: plan.reply, params: plan.replyParams, paramKeys: plan.replyParamKeys, actions: plan.actions, source: u.source === 'ai' ? 'ai' : 'device', note }
          : { id: nextId++, from: 'voyage', reply: 'asst.notSure', suggest: true, note },
      ]);
    },
    [ctx, points?.total],
  );

  const send = useCallback(
    async (raw: string) => {
      const said = raw.trim();
      if (!said) return;
      setText('');
      setMsgs((m) => [...m, { id: nextId++, from: 'me', text: said }]);

      // Language change is handled on the phone, no AI needed.
      const wanted = languageRequest(said);
      if (wanted) {
        settings.update({ language: wanted });
        setMsgs((m) => [...m, { id: nextId++, from: 'voyage', reply: 'asst.reply.language', params: { lang: languageInfo(wanted).native }, source: 'device' }]);
        return;
      }

      setThinking(true);
      try {
        if (online) {
          // The server answers: the AI with tools when configured, else its built-in rules.
          // The reply streams in as it is written.
          const id = nextId++;
          let shown = false;
          const show = (patch: Partial<Extract<Msg, { from: 'voyage' }>>) =>
            setMsgs((m) => {
              const has = m.some((x) => x.id === id);
              if (!has) return [...m, { id, from: 'voyage', text: '', source: 'ai', ...patch } as Msg];
              return m.map((x) => (x.id === id ? ({ ...x, ...patch } as Msg) : x));
            });
          try {
            const res = await fetch('/api/assistant/chat/stream', {
              method: 'POST',
              credentials: 'same-origin',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ conversationId: conversationId ?? undefined, message: said, lang }),
            });
            if (!res.ok || !res.body) throw new Error(`chat ${res.status}`);
            const reader = res.body.getReader();
            const dec = new TextDecoder();
            let buf = '';
            let text = '';
            for (;;) {
              const { value, done } = await reader.read();
              if (done) break;
              buf += dec.decode(value, { stream: true });
              const events = buf.split('\n\n');
              buf = events.pop() ?? '';
              for (const ev of events) {
                const event = ev.match(/^event: (.+)$/m)?.[1];
                const data = ev
                  .split('\n')
                  .filter((l) => l.startsWith('data:'))
                  .map((l) => l.slice(5).replace(/^ /, ''))
                  .join('\n');
                if (event === 'tool') setLooking(data);
                else if (event === 'delta') {
                  text += data;
                  shown = true;
                  setThinking(false);
                  show({ text });
                } else if (event === 'replace') {
                  text = data;
                  shown = true;
                  setThinking(false);
                  show({ text });
                } else if (event === 'note') show({ noteText: data });
                else if (event === 'done') {
                  const d = JSON.parse(data) as { conversationId: string; reply: string; links: Link[]; provider: string };
                  setConversationId(d.conversationId);
                  writeConv(d.conversationId);
                  show({ text: d.reply, links: d.links, provider: d.provider, source: d.provider === 'rules' ? 'device' : 'ai' });
                  if (spokenRef.current) speak(d.reply, info.speech);
                }
              }
            }
            if (!shown) throw new Error('empty');
            return;
          } catch {
            // Server unreachable: the on-device assistant still answers.
            await answerOnDevice(said, 'asst.aiBusy');
            return;
          } finally {
            setLooking(null);
            spokenRef.current = false;
          }
        }
        await answerOnDevice(said);
      } finally {
        setThinking(false);
      }
    },
    [settings, online, conversationId, lang, answerOnDevice, info.speech],
  );

  const [serverStt, setServerStt] = useState(false);
  useEffect(() => {
    if (online) api<{ stt: string | null }>('GET', '/assistant/voice').then((r) => setServerStt(!!r.stt)).catch(() => undefined);
  }, [online]);
  const voice = useVoiceInput(
    info.speech,
    (heard) => {
      spokenRef.current = true; // a spoken question gets a spoken answer
      void send(heard);
    },
    { serverStt },
  );

  const render = (m: Extract<Msg, { from: 'voyage' }>) => {
    if (m.text) return m.text;
    const extra = Object.fromEntries(Object.entries(m.paramKeys ?? {}).map(([k, key]) => [k, t(key)]));
    return t(m.reply!, { ...m.params, ...extra });
  };

  const act = async (a: AssistantAction) => {
    // A reported delay is only recorded when the traveller taps the button.
    if (a.report && ctx) {
      await (a.report.kind === 'delay' ? setDelay : setPrepone)(ctx.tripId, a.report.flightId, a.report.minutes, 'reported');
    }
    navigate(a.to);
  };

  const newChat = () => {
    setMsgs([]);
    setConversationId(null);
    writeConv(null);
  };

  if (!traveller) return null;
  const hello: Msg = { id: 0, from: 'voyage', reply: 'asst.hello', params: { name: me?.name ?? traveller.name } };
  const micDisabled = !voice.supported || !online;

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col">
      <PageHeader
        title={t('asst.title')}
        sub={t('asst.sub')}
        source="cloud"
        right={
          <>
            <button
              onClick={() => {
                setChats([]);
                api<{ conversations: { id: string; title: string; updatedAt: string }[] }>('GET', '/assistant/conversations')
                  .then((r) => setChats(r.conversations))
                  .catch(() => setChats([]));
              }}
              aria-label="Chat history"
              className="grid h-tap w-9 place-items-center rounded-full text-espresso"
            >
              <History size={16} />
            </button>
            <button
              onClick={() => {
                setMuted(!muted);
                setMutedState(!muted);
              }}
              aria-label={muted ? 'Turn read-aloud on' : 'Mute read-aloud'}
              aria-pressed={muted}
              className="grid h-tap w-9 place-items-center rounded-full text-espresso"
            >
              {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            {msgs.length > 0 && (
              <button onClick={newChat} aria-label={t('asst.newChat')} className="flex min-h-tap items-center gap-1 rounded-pill px-2 text-xs font-medium text-espresso">
                <Plus size={14} /> {t('asst.newChat')}
              </button>
            )}
            <Chip tone={provider && online ? 'ok' : undefined}>{provider && online ? t('asst.connected', { provider: providerName(provider) }) : online ? 'Built-in assistant' : t('asst.fallback')}</Chip>
          </>
        }
      />
      {speaking && (
        <button onClick={stopSpeaking} className="mx-gutter mb-2 flex min-h-tap items-center gap-2 rounded-pill bg-ink px-4 text-sm text-ivory">
          <Square size={14} /> Stop reading aloud
        </button>
      )}
      {chats && (
        <Sheet open onClose={() => setChats(null)} title="Your chats">
          <ul className="max-h-[55vh] space-y-1 overflow-y-auto">
            {chats.length === 0 && <li className="px-2 py-3 text-sm text-muted">No saved chats yet.</li>}
            {chats.map((cv) => (
              <li key={cv.id}>
                <button
                  onClick={() => {
                    setChats(null);
                    api<{ messages: { role: string; text: string; links: Link[] }[] }>('GET', `/assistant/conversations/${cv.id}`).then((r) => {
                      setConversationId(cv.id);
                      writeConv(cv.id);
                      setMsgs(r.messages.map((m) => (m.role === 'user' ? { id: nextId++, from: 'me' as const, text: m.text } : { id: nextId++, from: 'voyage' as const, text: m.text, links: m.links, source: 'ai' as const })));
                    });
                  }}
                  className="flex min-h-tap w-full items-center justify-between rounded-md px-3 text-left text-sm hover:bg-sand"
                >
                  <span className="truncate text-ink">{cv.title}</span>
                  <span className="shrink-0 text-xs text-muted">{new Date(cv.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                </button>
              </li>
            ))}
          </ul>
          {chats.length > 0 && (
            <button
              onClick={() => {
                void api('DELETE', '/assistant/conversations').then(() => {
                  setChats(null);
                  newChat();
                });
              }}
              className="mt-3 flex min-h-tap w-full items-center justify-center gap-2 text-sm text-bad underline underline-offset-4"
            >
              <Trash2 size={14} /> Clear all chats
            </button>
          )}
        </Sheet>
      )}

      <div className="flex-1 space-y-3 px-gutter" aria-live="polite">
        {[hello, ...msgs].map((m) =>
          m.from === 'me' ? (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="ml-auto max-w-[85%] rounded-lg rounded-br-sm bg-ink px-4 py-3 text-[0.9375rem] leading-relaxed text-ivory"
            >
              {m.text}
            </motion.div>
          ) : (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-[88%] rounded-lg rounded-bl-sm border border-line bg-paper px-4 py-3 text-[0.9375rem] leading-relaxed text-ink"
            >
              {m.note && <p className="mb-2 text-xs text-muted">{t(m.note)}</p>}
              {m.noteText && <p className="mb-2 text-xs text-muted">{m.noteText}</p>}
              <p className="whitespace-pre-line">{render(m)}</p>

              {m.suggest && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {SUGGESTIONS.map((k) => (
                    <button key={k} onClick={() => void send(t(k))} className="min-h-[2.5rem] rounded-pill border border-line bg-ivory px-3 text-sm text-espresso">
                      {t(k)}
                    </button>
                  ))}
                </div>
              )}

              {m.actions?.map((a) => (
                <button
                  key={a.to + a.label}
                  onClick={() => void act(a)}
                  className={`mt-3 flex min-h-[2.75rem] w-full items-center justify-between rounded-pill px-4 text-sm font-medium ${a.report ? 'bg-ink text-ivory' : 'bg-lavender text-ink'}`}
                >
                  {t(a.label, a.labelParams)} <ArrowUpRight size={16} />
                </button>
              ))}
              {m.links?.map((l) => (
                <button key={l.to} onClick={() => navigate(l.to)} className="mt-3 flex min-h-[2.75rem] w-full items-center justify-between rounded-pill bg-lavender px-4 text-sm font-medium text-ink">
                  {l.label} <ArrowUpRight size={16} />
                </button>
              ))}

              {m.id !== 0 && (
                <div className="mt-2 flex items-center justify-between gap-2">
                  {m.source ? (
                    <span className="flex items-center gap-1 text-[0.6875rem] text-muted">
                      {m.source === 'ai' ? <Sparkles size={12} /> : <Smartphone size={12} />}
                      {m.text ? t('asst.answeredBy', { provider: providerName(m.provider ?? provider) }) : t(m.source === 'ai' ? 'asst.understoodAi' : 'asst.understoodOnDevice')}
                    </span>
                  ) : (
                    <span />
                  )}
                  <button
                    onClick={() => speak(render(m), info.speech)}
                    aria-label={t('asst.readAloud')}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-espresso hover:bg-sand"
                  >
                    <Volume2 size={16} />
                  </button>
                </div>
              )}
            </motion.div>
          ),
        )}
        {looking && (
          <p className="text-xs text-muted">Looking up {looking.replace(/_/g, ' ')}…</p>
        )}
        {thinking && (
          <div className="flex w-16 gap-1 rounded-lg border border-line bg-paper px-4 py-3">
            {[0, 1, 2].map((i) => (
              <motion.span key={i} className="h-2 w-2 rounded-full bg-muted" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }} />
            ))}
          </div>
        )}
        <div ref={end} />
      </div>

      <div className="sticky bottom-28 bg-gradient-to-t from-ivory via-ivory to-transparent px-gutter pb-2 pt-6">
        {msgs.length === 0 && (
          <div className="no-scrollbar -mx-gutter mb-3 flex gap-2 overflow-x-auto px-gutter">
            {SUGGESTIONS.map((k) => (
              <button key={k} onClick={() => void send(t(k))} className="min-h-[2.5rem] shrink-0 rounded-pill border border-line bg-paper px-4 text-sm text-espresso">
                {t(k)}
              </button>
            ))}
          </div>
        )}
        {(micDisabled || voice.error) && <p className="mb-2 px-2 text-xs text-muted">{!voice.supported ? t('asst.voiceUnsupported') : t('asst.voiceOffline')}</p>}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(text);
          }}
          className="flex items-center gap-2 rounded-pill border border-line bg-paper p-1.5 pl-2 shadow-card"
        >
          <button
            type="button"
            onClick={voice.listening ? voice.stop : voice.start}
            disabled={micDisabled}
            aria-label={voice.listening ? t('asst.stop') : t('asst.speak')}
            className={`grid h-tap w-tap shrink-0 place-items-center rounded-full disabled:opacity-40 ${voice.listening ? 'animate-pulse bg-bad text-paper' : 'bg-rose text-ink'}`}
          >
            {voice.listening ? <Square size={18} /> : <Mic size={20} />}
          </button>
          <input
            value={voice.listening ? voice.interim || t('asst.listening') : text}
            onChange={(e) => setText(e.target.value)}
            readOnly={voice.listening}
            placeholder={t('asst.placeholder')}
            lang={info.htmlLang}
            className="min-h-tap min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-muted/70"
          />
          <button type="submit" disabled={thinking} aria-label={t('asst.send')} className="grid h-tap w-tap shrink-0 place-items-center rounded-full bg-ink text-ivory disabled:opacity-60">
            <ArrowUp size={20} />
          </button>
        </form>
      </div>
    </div>
  );
}
