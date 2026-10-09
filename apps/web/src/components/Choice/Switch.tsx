import type { InputHTMLAttributes, ReactNode } from 'react';
import styles from './Choice.module.css';

interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'role'> {
  label: ReactNode;
}

/** On/off setting that applies immediately. A native checkbox with role="switch". */
export function Switch({ label, className, ...rest }: SwitchProps) {
  return (
    <label className={[styles.choice, styles.switchChoice, className].filter(Boolean).join(' ')}>
      <span className={styles.control}>
        <input
          {...rest}
          type="checkbox"
          role="switch"
          className={`${styles.input} ${styles.track}`}
        />
        <span className={styles.thumb} aria-hidden="true" />
      </span>
      <span className={styles.text}>{label}</span>
    </label>
  );
}
