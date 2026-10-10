import { useCallback, useEffect, useRef, useState } from 'react';

// Voice typing (Web Speech API) and read-aloud (speech synthesis).
// Recognition usually runs on the browser maker's servers, so it needs internet;
// read-aloud runs on the phone.

interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}

type RecognitionCtor = new () => RecognitionLike;

function recognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useVoiceInput(lang: string, onFinal: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<RecognitionLike | null>(null);
  const supported = recognitionCtor() !== null;

  const stop = useCallback(() => rec.current?.stop(), []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    setError(null);
    const r = new Ctor();
    r.lang = lang;
    r.interimResults = true;
    r.maxAlternatives = 1;
    r.onresult = (e) => {
      const last = e.results[e.results.length - 1];
      const text = last[0]?.transcript ?? '';
      if (last.isFinal) {
        setInterim('');
        onFinal(text);
      } else setInterim(text);
    };
    r.onerror = (e) => setError(e.error);
    r.onend = () => {
      setListening(false);
      setInterim('');
    };
    rec.current = r;
    setListening(true);
    r.start();
  }, [lang, onFinal]);

  useEffect(() => () => rec.current?.stop(), []);

  return { supported, listening, interim, error, start, stop };
}

/** Read text aloud in the given language, using a matching voice if the phone has one. */
export function speak(text: string, lang: string) {
  if (!('speechSynthesis' in window)) return false;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang.replace('_', '-').toLowerCase().startsWith(lang.toLowerCase().slice(0, 2)));
  if (voice) u.voice = voice;
  window.speechSynthesis.speak(u);
  return true;
}
