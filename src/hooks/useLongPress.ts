import { useRef } from 'react';

/** Pointer handlers that fire `onLongPress` after holding for `ms`. */
export function useLongPress(onLongPress: () => void, ms = 700) {
  const timer = useRef<number | undefined>(undefined);
  const clear = () => window.clearTimeout(timer.current);
  return {
    onPointerDown: () => {
      clear();
      timer.current = window.setTimeout(onLongPress, ms);
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
  };
}
