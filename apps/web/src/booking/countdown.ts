import { useEffect, useState } from 'react';

/**
 * Seconds left until `expiresAt`, by the server's clock: `serverNow` is the server time of the
 * answer, so a wrong device clock does not change the countdown. Ticks every second.
 */
export function useSecondsLeft(expiresAt: string | null, serverNow: string): number {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const offset = Date.parse(serverNow) - Date.now();
    const end = expiresAt ? Date.parse(expiresAt) : 0;
    const update = () => {
      setLeft(Math.max(0, Math.ceil((end - (Date.now() + offset)) / 1000)));
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [expiresAt, serverNow]);
  // Before the first tick: the full time from the server's answer.
  return (
    left ??
    Math.max(0, Math.ceil(((expiresAt ? Date.parse(expiresAt) : 0) - Date.parse(serverNow)) / 1000))
  );
}

/** 125 → "02:05". */
export const formatTimer = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
