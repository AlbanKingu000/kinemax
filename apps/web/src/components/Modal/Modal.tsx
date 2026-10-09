import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { useMessages } from '../../i18n/use-messages';
import { Button } from '../Button/Button';
import styles from './Modal.module.css';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  /** Buttons at the bottom (e.g. cancel / confirm). */
  footer?: ReactNode;
  /** Element to focus when the dialog opens (defaults to the first focusable element). */
  initialFocusRef?: RefObject<HTMLElement | null>;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal dialog: rendered into <body>, everything else becomes inert, focus is trapped inside,
 * Escape and the backdrop close it, and focus returns to the element that opened it.
 */
export function Modal({ open, onClose, title, children, footer, initialFocusRef }: ModalProps) {
  const t = useMessages();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // Make the rest of the page inert (no focus, no clicks, hidden from screen readers).
    const portal = portalRef.current;
    const inerted = [...document.body.children].filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement && element !== portal && !element.inert,
    );
    for (const element of inerted) element.inert = true;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const panel = panelRef.current;
    const first = initialFocusRef?.current ?? panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel;
    first?.focus();

    return () => {
      for (const element of inerted) element.inert = false;
      document.body.style.overflow = overflow;
      previouslyFocused?.focus();
    };
  }, [open, initialFocusRef]);

  if (!open) return null;

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onCloseRef.current();
      return;
    }
    if (event.key !== 'Tab' || !panelRef.current) return;
    const focusable = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) {
      event.preventDefault();
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return createPortal(
    <div ref={portalRef} className={styles.layer}>
      <div
        className={styles.backdrop}
        aria-hidden="true"
        onClick={() => {
          onCloseRef.current();
        }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={styles.panel}
        onKeyDown={onKeyDown}
      >
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <Button
            variant="icon"
            icon="close"
            size="sm"
            aria-label={t.common.close}
            onClick={() => {
              onCloseRef.current();
            }}
          />
        </div>
        <div className={styles.body}>{children}</div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
