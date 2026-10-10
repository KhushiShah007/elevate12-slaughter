import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowUp, ArrowUpRight, Mic, Plus, Smartphone, Sparkles, Square, Volume2 } from 'lucide-react';
import { PageHeader } from '../../components/layout/PageHeader';
import { Chip } from '../../components/ui/Chip';
import { useNextFlight, useTraveller, useTrip, useTrips } from '../../hooks/useTrip';
import { usePoints } from '../../hooks/usePoints';
import { useOnline } from '../../hooks/useOnline';
import { speak, useVoiceInput } from '../../hooks/useSpeech';
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
    };

const SUGGESTIONS: MessageKey[] = ['asst.suggest.delay', 'asst.suggest.boarding', 'asst.suggest.layover', 'asst.suggest.missed'];
const NEEDS_FLIGHT: Intent[] = ['delay', 'missed', 'connecting', 'layover', 'preponed', 'boardingPass', 'nextFlight', 'family'];
const providerName = (p: string | null | undefined) => (p === 'grok' ? 'Grok' : p === 'groq' ? 'Groq' : 'AI');

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
        if (provider && online) {
          try {
            const r = await api<{ conversationId: string; reply: string; links: Link[]; provider: string }>(
              'POST',
              '/assistant/chat',
              { conversationId: conversationId ?? undefined, message: said, lang },
              45_000,
            );
            setConversationId(r.conversationId);
            writeConv(r.conversationId);
            setMsgs((m) => [...m, { id: nextId++, from: 'voyage', text: r.reply, links: r.links, source: 'ai', provider: r.provider }]);
            return;
          } catch {
            // AI busy, down or offline: the on-device assistant still answers.
            await answerOnDevice(said, 'asst.aiBusy');
            return;
          }
        }
        await answerOnDevice(said);
      } finally {
        setThinking(false);
      }
    },
    [settings, provider, online, conversationId, lang, answerOnDevice],
  );

  const voice = useVoiceInput(info.speech, (heard) => void send(heard));

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
            {msgs.length > 0 && (
              <button onClick={newChat} aria-label={t('asst.newChat')} className="flex min-h-tap items-center gap-1 rounded-pill px-2 text-xs font-medium text-espresso">
                <Plus size={14} /> {t('asst.newChat')}
              </button>
            )}
            <Chip tone={provider && online ? 'ok' : undefined}>{provider && online ? t('asst.connected', { provider: providerName(provider) }) : t('asst.fallback')}</Chip>
          </>
        }
      />

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
