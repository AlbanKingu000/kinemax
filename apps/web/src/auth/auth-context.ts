import type { AuthUser, Locale } from '@kinemax/shared';
import { createContext, useContext } from 'react';

export interface AuthContextValue {
  /** "loading" until GET /api/auth/session answered. */
  status: 'loading' | 'anonymous' | 'authenticated';
  user: AuthUser | null;
  login: (input: { email: string; password: string }) => Promise<AuthUser>;
  register: (input: {
    name: string;
    email: string;
    password: string;
    preferredLocale: Locale;
  }) => Promise<AuthUser>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  updateMe: (input: { name?: string; preferredLocale?: Locale }) => Promise<AuthUser>;
  changePassword: (input: { currentPassword: string; newPassword: string }) => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
