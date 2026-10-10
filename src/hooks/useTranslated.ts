import { useEffect, useState } from 'react';
import { translateTexts } from '../ai/translate';
import { useT } from '../i18n';

/**
 * Engine-generated sentences in the chosen language. Shows English straight away,
 * swaps in translations when they arrive, and reports when some stay in English.
 */
export function useTranslated(items: { id: string; text: string }[]) {
  const { lang, info } = useT();
  const signature = `${lang}|${items.map((i) => `${i.id}:${i.text}`).join('|')}`;
  const [state, setState] = useState<{ signature: string; texts: Record<string, string>; complete: boolean } | null>(null);

  useEffect(() => {
    if (lang === 'en' || !items.length) return;
    let alive = true;
    void translateTexts(items, info.english).then((r) => alive && setState({ signature, texts: r.texts, complete: r.complete }));
    return () => {
      alive = false;
    };
  }, [signature]); // signature captures the language and every id and text

  const fresh = state?.signature === signature;
  return {
    tr: (id: string, fallback: string) => (lang !== 'en' && fresh ? (state.texts[id] ?? fallback) : fallback),
    /** True once a translation attempt finished and some text is still in English. */
    inEnglish: lang !== 'en' && fresh && !state.complete,
  };
}
