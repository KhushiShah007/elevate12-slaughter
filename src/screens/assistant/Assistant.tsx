import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowUp, ArrowUpRight, Mic, Smartphone, Sparkles, Square, Volume2 } from 'lucide-react';
import { PageHeader } from '../../components/layout/PageHeader';
import { Chip } from '../../components/ui/Chip';
import { useNextFlight, useTraveller, useTrip } from '../../hooks/useTrip';
import { usePoints } from '../../hooks/usePoints';
import { useOnline } from '../../hooks/useOnline';
import { speak, useVoiceInput } from '../../hooks/useSpeech';
import { languageInfo, useT, type MessageKey, type Params } from '../../i18n';
import { useSettings } from '../../state/settings';
import { understand } from '../../ai/intent';
import { languageRequest } from '../../engines/intentMatcher';
import { planReply, type AssistantAction, type AssistantContext } from '../../engines/assistantPlan';
import { setDelay, setPrepone } from '../../db/repos/status';
import { clock } from '../../utils/format';

type Msg =
  | { id: number; from: 'me'; text: string }
  | {
      id: number;
      from: 'voyage';
      reply: MessageKey;
      params?: Params;
      paramKeys?: Record<string, MessageKey>;
      actions?: AssistantAction[];
      source?: 'device' | 'ai';
      suggest?: boolean;
    };

const SUGGESTIONS: MessageKey[] = ['asst.suggest.delay', 'asst.suggest.boarding', 'asst.suggest.layover', 'asst.suggest.missed'];

// The conversation survives tapping an 'Open' button and coming back (this tab only).
const CHAT_KEY = 'voyage.chat';
function loadChat(): Msg[] {
  try {
    return JSON.parse(sessionStorage.getItem(CHAT_KEY) ?? '[]') as Msg[];
  } catch {
    return [];
  }
}

let nextId = Math.max(0, ...loadChat().map((m) => m.id)) + 1;

export default function Assistant() {
  const navigate = useNavigate();
  const online = useOnline();
  const { t, info } = useT();
  const settings = useSettings();
  const traveller = useTraveller();
  const next = useNextFlight();
  const bundle = useTrip(next?.trip.id);
  const points = usePoints();
  const [msgs, setMsgs] = useState<Msg[]>(loadChat);
  const [text, setText] = useState('');
  const [thinking, setThinking] = useState(false);
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

  // What the assistant knows about right now: the next trip and flight.
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
      : null;

  const send = useCallback(
    async (raw: string) => {
      const said = raw.trim();
      if (!said || !ctx) return;
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
      const u = await understand(said);
      setThinking(false);
      const plan = planReply(u.intent, u.minutes, ctx);
      setMsgs((m) => [
        ...m,
        plan
          ? { id: nextId++, from: 'voyage', reply: plan.reply, params: plan.replyParams, paramKeys: plan.replyParamKeys, actions: plan.actions, source: u.source === 'ai' ? 'ai' : 'device' }
          : { id: nextId++, from: 'voyage', reply: 'asst.notSure', suggest: true },
      ]);
    },
    [ctx, settings],
  );

  const voice = useVoiceInput(info.speech, (heard) => void send(heard));

  // Replies are stored as message keys, so they re-translate if the language changes.
  const render = (m: Extract<Msg, { from: 'voyage' }>) => {
    const extra = Object.fromEntries(Object.entries(m.paramKeys ?? {}).map(([k, key]) => [k, t(key)]));
    return t(m.reply, { ...m.params, ...extra });
  };

  const act = async (a: AssistantAction) => {
    // A reported delay is only recorded when the traveller taps the button.
    if (a.report && ctx) {
      await (a.report.kind === 'delay' ? setDelay : setPrepone)(ctx.tripId, a.report.flightId, a.report.minutes, 'reported');
    }
    navigate(a.to);
  };

  if (!traveller) return null;
  const hello: Msg = { id: 0, from: 'voyage', reply: 'asst.hello', params: { name: traveller.name } };
  const micDisabled = !voice.supported || !online;

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col">
      <PageHeader title={t('asst.title')} sub={t('asst.sub')} source="cloud" right={<Chip>{t('asst.fallback')}</Chip>} />

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
              <p>{render(m)}</p>

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

              {m.id !== 0 && (
                <div className="mt-2 flex items-center justify-between gap-2">
                  {m.source ? (
                    <span className="flex items-center gap-1 text-[0.6875rem] text-muted">
                      {m.source === 'ai' ? <Sparkles size={12} /> : <Smartphone size={12} />}
                      {t(m.source === 'ai' ? 'asst.understoodAi' : 'asst.understoodOnDevice')}
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
          <button type="submit" aria-label={t('asst.send')} className="grid h-tap w-tap shrink-0 place-items-center rounded-full bg-ink text-ivory">
            <ArrowUp size={20} />
          </button>
        </form>
      </div>
    </div>
  );
}
