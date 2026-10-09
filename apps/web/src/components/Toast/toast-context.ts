import { createContext, useContext } from 'react';

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

export interface ToastOptions {
  tone?: ToastTone;
  title: string;
  description?: string;
  /** Milliseconds before it closes on its own; 0 keeps it until dismissed. Default 6000. */
  duration?: number;
}

export interface ToastApi {
  /** Shows a toast and returns its id. */
  show: (options: ToastOptions) => number;
  dismiss: (id: number) => void;
}

export const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside <ToastProvider>');
  return api;
}
