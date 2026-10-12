import { useCallback, useEffect, useRef, useState } from 'react';

export type AsyncState<T> =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: T };

const LOADING = { status: 'loading' } as const;

/**
 * Runs `load` when `key` changes (and on `retry`), aborting the previous request. `key` must
 * describe everything `load` depends on; the latest `load` is used without restarting on its own.
 * While `enabled` is false nothing runs and the state stays "loading".
 */
export function useAsync<T>(
  load: (signal: AbortSignal) => Promise<T>,
  key: string,
  enabled = true,
): AsyncState<T> & { retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  // The result remembers which request it belongs to; any other request is still loading.
  const [result, setResult] = useState<{ request: string; state: AsyncState<T> } | null>(null);
  const loadRef = useRef(load);
  const request = `${key}#${String(attempt)}`;

  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    loadRef.current(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setResult({ request, state: { status: 'ready', data } });
      },
      () => {
        if (!controller.signal.aborted) setResult({ request, state: { status: 'error' } });
      },
    );
    return () => {
      controller.abort();
    };
  }, [request, enabled]);

  const retry = useCallback(() => {
    setAttempt((n) => n + 1);
  }, []);
  const state = enabled && result?.request === request ? result.state : LOADING;
  return { ...state, retry };
}
