import { useCallback, useEffect, useRef, useState } from 'react';

// Voice typing and read-aloud.
// - Speech to text: the browser's Web Speech API (Chrome, Edge, Safari) with clear error
//   messages; where it is missing, record a short clip and send it to the server's
//   speech-to-text (when a Deepgram or Whisper key is set).
// - Text to speech: speechSynthesis on the phone, with stop and mute.

interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
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

/** Microphones only work on secure pages (https, or localhost while developing). */
const secure = () => window.isSecureContext || location.hostname === 'localhost';

const ERRORS: Record<string, string> = {
  'not-allowed': 'Microphone is blocked. Allow it in your browser’s site settings, then try again.',
  'service-not-allowed': 'Voice typing is turned off in this browser. Allow it in settings, or type.',
  'no-speech': 'I did not hear anything. Tap the mic and speak.',
  'audio-capture': 'No microphone found on this device.',
  network: 'Voice typing needs internet in this browser.',
  aborted: '',
};

export function useVoiceInput(lang: string, onFinal: (text: string) => void, opts: { serverStt?: boolean } = {}) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<RecognitionLike | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const native = recognitionCtor() !== null;
  const canRecord = typeof window !== 'undefined' && 'MediaRecorder' in window && !!navigator.mediaDevices?.getUserMedia;
  const supported = secure() && (native || (!!opts.serverStt && canRecord));

  const stop = useCallback(() => {
    rec.current?.stop();
    if (recorder.current?.state === 'recording') recorder.current.stop();
  }, []);

  const startRecording = useCallback(async () => {
    // Fallback: record up to 15 seconds and send it to the server.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const mr = new MediaRecorder(stream);
      recorder.current = mr;
      mr.ondataavailable = (e) => chunks.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setListening(false);
        setInterim('');
        const form = new FormData();
        form.set('audio', new Blob(chunks, { type: mr.mimeType || 'audio/webm' }), 'clip.webm');
        form.set('lang', lang);
        try {
          const res = await fetch('/api/assistant/stt', { method: 'POST', body: form, credentials: 'same-origin' });
          const j = (await res.json()) as { text?: string; error?: { message: string } };
          if (!res.ok) return setError(j.error?.message ?? 'Could not understand that.');
          if (j.text) onFinal(j.text);
          else setError(ERRORS['no-speech']);
        } catch {
          setError('Could not reach Voyage. Check your connection.');
        }
      };
      setInterim('Recording… tap stop when done');
      setListening(true);
      mr.start();
      setTimeout(() => mr.state === 'recording' && mr.stop(), 15_000);
    } catch (e) {
      setError((e as Error).name === 'NotAllowedError' ? ERRORS['not-allowed'] : ERRORS['audio-capture']);
    }
  }, [lang, onFinal]);

  const start = useCallback(() => {
    setError(null);
    if (!secure()) return setError('The microphone only works on a secure (https) page.');
    const Ctor = recognitionCtor();
    if (!Ctor) {
      if (opts.serverStt && canRecord) void startRecording();
      else setError('This browser cannot do voice typing. You can still type.');
      return;
    }
    const r = new Ctor();
    r.lang = lang;
    r.interimResults = true;
    r.maxAlternatives = 1;
    r.continuous = false;
    r.onresult = (e) => {
      const last = e.results[e.results.length - 1];
      const text = last[0]?.transcript ?? '';
      if (last.isFinal) {
        setInterim('');
        onFinal(text);
      } else setInterim(text);
    };
    r.onerror = (e) => {
      const msg = ERRORS[e.error] ?? `Voice typing stopped (${e.error}).`;
      if (msg) setError(msg);
    };
    r.onend = () => {
      setListening(false);
      setInterim('');
    };
    rec.current = r;
    setListening(true);
    try {
      r.start();
    } catch {
      setListening(false);
      setError('Voice typing is already running. Try again in a moment.');
    }
  }, [lang, onFinal, opts.serverStt, canRecord, startRecording]);

  useEffect(
    () => () => {
      rec.current?.stop();
      if (recorder.current?.state === 'recording') recorder.current.stop();
    },
    [],
  );

  return { supported, native, listening, interim, error, start, stop };
}

const MUTE_KEY = 'voyage.voiceMuted';
export const isMuted = () => {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
};
export const setMuted = (v: boolean) => {
  try {
    localStorage.setItem(MUTE_KEY, v ? '1' : '0');
  } catch {
    /* storage blocked */
  }
  if (v) stopSpeaking();
};

/** Read text aloud in the given language, using a matching voice if the phone has one. */
export function speak(text: string, lang: string, opts: { force?: boolean } = {}) {
  if (!('speechSynthesis' in window)) return false;
  if (isMuted() && !opts.force) return false;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  const voices = window.speechSynthesis.getVoices();
  const voice = voices.find((v) => v.lang.replace('_', '-').toLowerCase() === lang.toLowerCase()) ?? voices.find((v) => v.lang.replace('_', '-').toLowerCase().startsWith(lang.toLowerCase().slice(0, 2)));
  if (voice) u.voice = voice;
  window.speechSynthesis.speak(u);
  return true;
}

export function stopSpeaking() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

/** True while something is being read aloud. */
export function useSpeaking() {
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const t = setInterval(() => setSpeaking(window.speechSynthesis.speaking), 400);
    return () => clearInterval(t);
  }, []);
  return speaking;
}
