import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMessages } from '../../i18n/use-messages';
import { Icon } from '../Icon/Icon';
import type { IconName } from '../Icon/icon-paths';
import { useIsModalOpen } from '../Modal/modal-stack';
import { ToastContext, type ToastOptions, type ToastTone } from './toast-context';
import styles from './Toast.module.css';

interface ToastItem extends Required<Omit<ToastOptions, 'description'>> {
  id: number;
  description?: string;
}

const MAX_VISIBLE = 3;
const ICONS: Record<ToastTone, IconName> = {
  success: 'success',
  error: 'error',
  warning: 'warning',
  info: 'info',
};

/**
 * Toast notifications. The list is a polite live region that exists from the start, so screen
 * readers announce new toasts; errors use role="alert". Timers pause on hover and focus. While a
 * modal dialog is open, toasts wait and appear (with their full duration) once it closes.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const t = useMessages();
  const modalOpen = useIsModalOpen();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback((options: ToastOptions) => {
    const id = nextId.current++;
    const toast: ToastItem = { tone: 'info', duration: 6000, ...options, id };
    setToasts((current) => [...current, toast].slice(-MAX_VISIBLE));
    return id;
  }, []);

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext value={api}>
      {children}
      <section className={styles.region} aria-label={t.toast.region}>
        <ol className={styles.list} aria-live="polite">
          {/* Queued while a dialog is open: they would cover it and be inert behind it. */}
          {(modalOpen ? [] : toasts).map((toast) => (
            <Toast
              key={toast.id}
              toast={toast}
              dismissLabel={t.toast.dismiss}
              onDismiss={() => {
                dismiss(toast.id);
              }}
            />
          ))}
        </ol>
      </section>
    </ToastContext>
  );
}

function Toast({
  toast,
  dismissLabel,
  onDismiss,
}: {
  toast: ToastItem;
  dismissLabel: string;
  onDismiss: () => void;
}) {
  const [paused, setPaused] = useState(false);
  const remaining = useRef(toast.duration);
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  });

  useEffect(() => {
    if (paused || toast.duration === 0) return;
    const started = Date.now();
    const timer = window.setTimeout(() => {
      onDismissRef.current();
    }, remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current -= Date.now() - started;
    };
  }, [paused, toast.duration]);

  const pause = () => {
    setPaused(true);
  };
  const resume = () => {
    setPaused(false);
  };

  return (
    <li
      className={`${styles.toast} ${styles[toast.tone]}`}
      role={toast.tone === 'error' ? 'alert' : undefined}
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocus={pause}
      onBlur={resume}
    >
      <Icon name={ICONS[toast.tone]} size={20} className={styles.icon} />
      <div className={styles.content}>
        <p className={styles.title}>{toast.title}</p>
        {toast.description && <p className={styles.description}>{toast.description}</p>}
      </div>
      <button
        type="button"
        className={styles.dismiss}
        aria-label={dismissLabel}
        onClick={onDismiss}
      >
        <Icon name="close" size={16} />
      </button>
    </li>
  );
}
