// Fixed-window rate limiter kept in process memory.
// Fine for a single API process. With several instances every process would count separately, so
// production with more than one instance needs a shared store (e.g. Redis or a database table).

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the window resets (for Retry-After); 0 when allowed. */
  retryAfterSeconds: number;
}

export interface RateLimiter {
  /** Counts one attempt for `key` and says whether it is still within the limit. */
  hit(key: string): RateLimitResult;
  reset(key: string): void;
}

export interface RateLimitRule {
  windowMs: number;
  max: number;
}

export function createRateLimiter(rule: RateLimitRule, now: () => number = Date.now): RateLimiter {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  let lastPrune = now();

  const prune = (time: number) => {
    if (time - lastPrune < rule.windowMs) return;
    lastPrune = time;
    for (const [key, bucket] of buckets) if (bucket.resetAt <= time) buckets.delete(key);
  };

  return {
    hit(key) {
      const time = now();
      prune(time);
      let bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= time) {
        bucket = { count: 0, resetAt: time + rule.windowMs };
        buckets.set(key, bucket);
      }
      bucket.count++;
      if (bucket.count <= rule.max) return { allowed: true, retryAfterSeconds: 0 };
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - time) / 1000)),
      };
    },
    reset(key) {
      buckets.delete(key);
    },
  };
}

const MINUTE = 60_000;

/** Rate limits of the auth endpoints (see docs/auth.md). */
export const AUTH_RATE_LIMITS = {
  /** Wrong guesses for one account from one IP. Reset after a successful login. */
  loginPerEmailAndIp: { windowMs: 15 * MINUTE, max: 5 },
  /** All login attempts from one IP (password spraying across many accounts). */
  loginPerIp: { windowMs: 15 * MINUTE, max: 20 },
  registerPerIp: { windowMs: 60 * MINUTE, max: 5 },
  changePasswordPerUser: { windowMs: 15 * MINUTE, max: 5 },
} satisfies Record<string, RateLimitRule>;

export type AuthRateLimits = Record<keyof typeof AUTH_RATE_LIMITS, RateLimitRule>;
