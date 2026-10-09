import styles from './Spinner.module.css';

/** Small decorative spinner; pair it with visible or screen-reader text. */
export function Spinner({ className }: { className?: string }) {
  return (
    <span className={[styles.spinner, className].filter(Boolean).join(' ')} aria-hidden="true" />
  );
}
