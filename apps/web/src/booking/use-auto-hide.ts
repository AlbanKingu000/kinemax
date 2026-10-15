import { useCallback, useEffect, useRef, useState, type FocusEvent } from 'react';

/** How long the view must stay still before the seat-view panel comes back. */
export const IDLE_MS = 800;
/** How long the look-around hint shows in the first seat view of a browser session. */
export const HINT_MS = 5000;
const HINT_SEEN_KEY = 'kinemax.lookHintSeen';

/**
 * The seat-view panel steps aside while the user looks around: `look()` (drag, one finger, arrow
 * keys) hides it, and it comes back once the view has been still for IDLE_MS. It never hides
 * while keyboard focus is inside it or the pointer is over it (it shows right away then). Hiding
 * is visual only (opacity), so the panel stays in the accessibility tree.
 */
export function useAutoHide() {
  const [looking, setLooking] = useState(false);
  const [focus, setFocus] = useState(false);
  const [hover, setHover] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
    },
    [],
  );
  const look = useCallback(() => {
    setLooking(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setLooking(false);
    }, IDLE_MS);
  }, []);
  const panelProps = {
    onFocus: () => {
      setFocus(true);
    },
    onBlur: (event: FocusEvent<HTMLElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setFocus(false);
    },
    onPointerEnter: () => {
      setHover(true);
    },
    onPointerLeave: () => {
      setHover(false);
    },
  };
  return { hidden: looking && !focus && !hover, look, panelProps };
}

/**
 * True while the look-around hint shows: the first HINT_MS of the first seat view in this browser
 * session (sessionStorage), never again after that.
 */
export function useLookHint(seated: boolean): boolean {
  const [state, setState] = useState<'unseen' | 'showing' | 'done'>(() => {
    try {
      return window.sessionStorage.getItem(HINT_SEEN_KEY) === '1' ? 'done' : 'unseen';
    } catch {
      return 'unseen';
    }
  });
  if (seated && state === 'unseen') setState('showing');
  useEffect(() => {
    if (state !== 'showing') return;
    try {
      window.sessionStorage.setItem(HINT_SEEN_KEY, '1');
    } catch {
      // Storage blocked: the hint still ends after HINT_MS for this page.
    }
    const timer = window.setTimeout(() => {
      setState('done');
    }, HINT_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [state]);
  return seated && state === 'showing';
}
