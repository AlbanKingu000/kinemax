import type { InputHTMLAttributes, ReactNode } from 'react';
import { Icon } from '../Icon/Icon';
import styles from './Choice.module.css';

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  /** "Some but not all" state, e.g. for a select-all box. */
  indeterminate?: boolean;
}

export function Checkbox({ label, indeterminate = false, className, ...rest }: CheckboxProps) {
  return (
    <label className={[styles.choice, className].filter(Boolean).join(' ')}>
      <span className={styles.control}>
        <input
          {...rest}
          type="checkbox"
          className={`${styles.input} ${styles.box}`}
          // The native indeterminate state is exposed to assistive technology as "mixed".
          ref={(node) => {
            if (node) node.indeterminate = indeterminate;
          }}
        />
        <Icon name={indeterminate ? 'minus' : 'check'} size={14} className={styles.mark} />
      </span>
      <span className={styles.text}>{label}</span>
    </label>
  );
}
