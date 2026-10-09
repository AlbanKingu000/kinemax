import type { ReactNode, Ref, SelectHTMLAttributes } from 'react';
import { Icon } from '../Icon/Icon';
import styles from './Select.module.css';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  children: ReactNode;
  ref?: Ref<HTMLSelectElement>;
}

/** Native select (best keyboard, screen reader and mobile support) in the Kinemax style. */
export function Select({ className, children, ...rest }: SelectProps) {
  return (
    <span className={styles.wrapper}>
      <select {...rest} className={[styles.select, className].filter(Boolean).join(' ')}>
        {children}
      </select>
      <Icon name="chevronDown" size={18} className={styles.chevron} />
    </span>
  );
}
