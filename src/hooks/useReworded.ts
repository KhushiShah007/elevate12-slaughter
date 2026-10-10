import { useEffect, useState } from 'react';
import { rewordReasons, type WordingSource } from '../ai/rewordOptions';

/**
 * Shows our template reasons straight away, then swaps in AI wording if it arrives.
 * `items` is the list of {id, text} reasons from the ranking engine.
 */
export function useReworded(items: { id: string; text: string }[]) {
  const signature = items.map((i) => `${i.id}:${i.text}`).join('|');
  const [state, setState] = useState<{ signature: string; texts: Record<string, string>; source: WordingSource }>({
    signature: '',
    texts: {},
    source: 'template',
  });

  useEffect(() => {
    let alive = true;
    if (!items.length) return;
    void rewordReasons(items).then((r) => alive && setState({ signature, texts: r.texts, source: r.source }));
    return () => {
      alive = false;
    };
  }, [signature]); // signature captures every id and reason in items

  const fresh = state.signature === signature;
  return {
    textFor: (id: string, fallback: string) => (fresh ? (state.texts[id] ?? fallback) : fallback),
    source: fresh ? state.source : ('template' as WordingSource),
  };
}
