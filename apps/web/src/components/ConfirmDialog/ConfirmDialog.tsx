import { useRef, type ReactNode } from 'react';
import { Button } from '../Button/Button';
import { Modal } from '../Modal/Modal';
import styles from './ConfirmDialog.module.css';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** The impact, stated plainly ("12 bileta do të anulohen dhe rimbursohen"). */
  children: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** While the action runs: a spinner on the confirm button, nothing can be clicked twice. */
  busy?: boolean;
  /** Shown under the text when the action failed. */
  error?: string;
}

/**
 * Asks before a destructive action. Focus starts on "cancel", so Enter never confirms by
 * accident; Escape and the backdrop cancel.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  busy = false,
  error,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onCancel}
      title={title}
      initialFocusRef={cancelRef}
      footer={
        <div className={styles.actions}>
          <Button ref={cancelRef} variant="secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button onClick={onConfirm} loading={busy} icon="warning">
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div className={styles.body}>{children}</div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
