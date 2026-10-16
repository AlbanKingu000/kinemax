// The one fetch wrapper for the API. State-changing requests (POST/PUT/PATCH/DELETE) carry the CSRF
// token in X-CSRF-Token. The token lives in memory only (never in storage); a missing or stale token
// (403 csrf_invalid) is fetched again and the request retried once.
import {
  apiErrorResponseSchema,
  CSRF_HEADER,
  csrfResponseSchema,
  type ApiErrorCode,
  type ApiFieldIssue,
} from '@kinemax/shared';
import type { ZodType } from 'zod';

/** A failed API request. `code` is the API's error code, or `network` when it was not reached. */
export class ApiRequestError extends Error {
  override name = 'ApiRequestError';
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode | 'network' | 'unknown' = 'unknown',
    readonly fields: readonly ApiFieldIssue[] = [],
    /** Seconds from Retry-After (429). */
    readonly retryAfterSeconds?: number,
    /** Seat hold conflicts (409): the seats someone else holds now. */
    readonly takenSeatIds: readonly string[] = [],
  ) {
    super(`API request failed: ${String(status)} ${code}`);
  }
}

let csrfToken: string | null = null;

/** Use the token the API returned with a new session (login, register, change-password). */
export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

async function fetchCsrfToken(): Promise<string> {
  const response = await fetch('/api/auth/csrf', {
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
  });
  if (!response.ok) throw await toError(response);
  csrfToken = csrfResponseSchema.parse(await response.json()).csrfToken;
  return csrfToken;
}

async function toError(response: Response): Promise<ApiRequestError> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  const parsed = apiErrorResponseSchema.safeParse(body);
  const retryAfter = Number(response.headers.get('Retry-After'));
  return new ApiRequestError(
    response.status,
    parsed.success ? parsed.data.error.code : 'unknown',
    parsed.success ? (parsed.data.error.fields ?? []) : [],
    Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
    parsed.success ? (parsed.data.error.takenSeatIds ?? []) : [],
  );
}

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

interface RequestOptions<T> {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** JSON-encoded, or sent as is when it is a Blob/File (uploads; the server reads the bytes). */
  body?: unknown;
  /** Validates a JSON answer; omit for empty answers (204). */
  schema?: ZodType<T>;
  signal?: AbortSignal;
}

/** Sends a request to the API and validates the answer. Throws ApiRequestError on failure. */
export async function apiRequest<T = undefined>(
  path: string,
  { method = 'GET', body, schema, signal }: RequestOptions<T> = {},
): Promise<T> {
  const send = async (token: string | null) => {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const raw = body instanceof Blob;
    if (body !== undefined) {
      headers['Content-Type'] = raw ? body.type || 'application/octet-stream' : 'application/json';
    }
    if (token) headers[CSRF_HEADER] = token;
    try {
      return await fetch(path, {
        method,
        headers,
        credentials: 'same-origin',
        ...(body !== undefined ? { body: raw ? body : JSON.stringify(body) } : {}),
        ...(signal ? { signal } : {}),
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new ApiRequestError(0, 'network');
    }
  };

  const needsToken = STATE_CHANGING.has(method);
  let response = await send(needsToken ? (csrfToken ?? (await fetchCsrfToken())) : null);
  if (needsToken && response.status === 403) {
    const error = await toError(response);
    if (error.code !== 'csrf_invalid') throw error;
    // The session changed (e.g. it expired) or the API restarted: one retry with a new token.
    response = await send(await fetchCsrfToken());
  }
  if (!response.ok) throw await toError(response);
  if (!schema) return undefined as T;
  return schema.parse(await response.json());
}
