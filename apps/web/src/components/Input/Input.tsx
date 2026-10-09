import type { InputHTMLAttributes, Ref } from 'react';
import { Icon } from '../Icon/Icon';
import type { IconName } from '../Icon/icon-paths';
import styles from './Input.module.css';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Decorative icon inside the field, before the text (e.g. search). */
  icon?: IconName;
  ref?: Ref<HTMLInputElement>;
}

/** Text input. Use it inside FormField, which provides the label, hint, error and aria wiring. */
export function Input({ icon, className, type = 'text', ...rest }: InputProps) {
  const input = (
    <input
      {...rest}
      type={type}
      className={[styles.input, icon && styles.withIcon, className].filter(Boolean).join(' ')}
    />
  );
  if (!icon) return input;
  return (
    <span className={styles.wrapper}>
      <Icon name={icon} size={18} className={styles.icon} />
      {input}
    </span>
  );
}
