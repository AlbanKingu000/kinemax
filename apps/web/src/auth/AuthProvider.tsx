import {
  authSessionResponseSchema,
  meResponseSchema,
  sessionResponseSchema,
  type AuthUser,
  type Locale,
} from '@kinemax/shared';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { apiRequest, ApiRequestError, setCsrfToken } from '../api/http';
import { useLocale } from '../i18n/use-messages';
import { AuthContext, type AuthContextValue } from './auth-context';

/** How long a language change waits before it is saved to the account (several clicks = one save). */
export const LOCALE_SAVE_DELAY_MS = 800;

/**
 * Loads the signed-in user (GET /api/auth/session) and offers the auth actions. The session lives in an
 * httpOnly cookie; this only knows the user. After login the UI switches to the user's language,
 * and later SQ/EN changes are saved to the account (debounced, silently ignored on failure).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const { locale, setLocale } = useLocale();
  const [state, setState] = useState<Pick<AuthContextValue, 'status' | 'user'>>({
    status: 'loading',
    user: null,
  });
  /** The language the account has on the server, to save only real changes. */
  const savedLocale = useRef<Locale | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    apiRequest('/api/auth/session', {
      schema: sessionResponseSchema,
      signal: controller.signal,
    }).then(
      ({ user }) => {
        if (!user) {
          setState({ status: 'anonymous', user: null });
          return;
        }
        savedLocale.current = user.preferredLocale;
        setState({ status: 'authenticated', user });
      },
      () => {
        // The API is unreachable: browse anonymously.
        if (!controller.signal.aborted) setState({ status: 'anonymous', user: null });
      },
    );
    return () => {
      controller.abort();
    };
  }, []);

  const signedIn = useCallback(
    (user: AuthUser, csrfToken: string) => {
      setCsrfToken(csrfToken);
      savedLocale.current = user.preferredLocale;
      setState({ status: 'authenticated', user });
      setLocale(user.preferredLocale);
      return user;
    },
    [setLocale],
  );

  const signedOut = useCallback(() => {
    // The session is gone; the next state-changing request fetches a fresh (anonymous) token.
    setCsrfToken(null);
    savedLocale.current = null;
    setState({ status: 'anonymous', user: null });
  }, []);

  // Save SQ/EN changes of a signed-in user to the account.
  const signedInUser = state.user;
  useEffect(() => {
    if (!signedInUser || savedLocale.current === null || locale === savedLocale.current) return;
    const timer = window.setTimeout(() => {
      apiRequest('/api/auth/me', {
        method: 'PATCH',
        body: { preferredLocale: locale },
        schema: meResponseSchema,
      }).then(
        (answer) => {
          savedLocale.current = answer.user.preferredLocale;
        },
        () => undefined,
      );
    }, LOCALE_SAVE_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [locale, signedInUser]);

  const login = useCallback<AuthContextValue['login']>(
    async (input) => {
      const answer = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: input,
        schema: authSessionResponseSchema,
      });
      return signedIn(answer.user, answer.csrfToken);
    },
    [signedIn],
  );

  const register = useCallback<AuthContextValue['register']>(
    async (input) => {
      const answer = await apiRequest('/api/auth/register', {
        method: 'POST',
        body: input,
        schema: authSessionResponseSchema,
      });
      return signedIn(answer.user, answer.csrfToken);
    },
    [signedIn],
  );

  const logout = useCallback(async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } finally {
      signedOut();
    }
  }, [signedOut]);

  const logoutAll = useCallback(async () => {
    try {
      await apiRequest('/api/auth/logout-all', { method: 'POST' });
    } catch (error) {
      // Already signed out (401): the goal is reached anyway.
      if (!(error instanceof ApiRequestError && error.status === 401)) throw error;
    }
    signedOut();
  }, [signedOut]);

  const updateMe = useCallback<AuthContextValue['updateMe']>(async (input) => {
    const answer = await apiRequest('/api/auth/me', {
      method: 'PATCH',
      body: input,
      schema: meResponseSchema,
    });
    savedLocale.current = answer.user.preferredLocale;
    setState({ status: 'authenticated', user: answer.user });
    return answer.user;
  }, []);

  const changePassword = useCallback<AuthContextValue['changePassword']>(async (input) => {
    const answer = await apiRequest('/api/auth/change-password', {
      method: 'POST',
      body: input,
      schema: authSessionResponseSchema,
    });
    // The session was rotated: the old token no longer works.
    setCsrfToken(answer.csrfToken);
    setState({ status: 'authenticated', user: answer.user });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, login, register, logout, logoutAll, updateMe, changePassword }),
    [state, login, register, logout, logoutAll, updateMe, changePassword],
  );
  return <AuthContext value={value}>{children}</AuthContext>;
}
