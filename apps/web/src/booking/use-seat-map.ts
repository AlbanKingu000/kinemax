import { seatMapResponseSchema, type SeatMapResponse } from '@kinemax/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../api/http';

/** How often availability is refreshed while the page is visible. */
export const SEATMAP_REFRESH_MS = 20_000;

export type SeatMapState =
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | { status: 'ready'; data: SeatMapResponse };

/**
 * Loads the seat map and refreshes it every 20 s while the tab is visible (paused when hidden,
 * refreshed at once when it becomes visible again). A failed refresh keeps the last good map.
 */
export function useSeatMap(showtimeId: string): SeatMapState & { refresh: () => void } {
  const [state, setState] = useState<SeatMapState>({ status: 'loading' });
  const hasData = useRef(false);

  const load = useCallback(
    (signal?: AbortSignal) =>
      apiRequest(`/api/showtimes/${encodeURIComponent(showtimeId)}/seatmap`, {
        schema: seatMapResponseSchema,
        ...(signal ? { signal } : {}),
      }).then(
        (data) => {
          hasData.current = true;
          if (!signal?.aborted) setState({ status: 'ready', data });
        },
        (error: unknown) => {
          if (!signal?.aborted && !hasData.current) setState({ status: 'error', error });
        },
      ),
    [showtimeId],
  );

  useEffect(() => {
    const controller = new AbortController();
    hasData.current = false;
    void load(controller.signal);
    let timer: number | undefined;
    const schedule = () => {
      window.clearInterval(timer);
      timer = document.hidden
        ? undefined
        : window.setInterval(() => void load(controller.signal), SEATMAP_REFRESH_MS);
    };
    const onVisibility = () => {
      if (!document.hidden) void load(controller.signal);
      schedule();
    };
    schedule();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [load]);

  const refresh = useCallback(() => {
    void load();
  }, [load]);
  return { ...state, refresh };
}

/** WebGL is available and the device is not very weak (few cores and little memory). */
export function canRender3D(): boolean {
  try {
    const canvas = document.createElement('canvas');
    if (!canvas.getContext('webgl2') && !canvas.getContext('webgl')) return false;
  } catch {
    return false;
  }
  const cores = navigator.hardwareConcurrency || 4;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  return !(cores <= 2 && memory <= 2);
}
