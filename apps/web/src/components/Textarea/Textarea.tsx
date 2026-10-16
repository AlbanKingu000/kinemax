import type { Ref, TextareaHTMLAttributes } from 'react';
import styles from './Textarea.module.css';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  ref?: Ref<HTMLTextAreaElement>;
}

/** Multi-line text input. Use it inside FormField, like Input. */
export function Textarea({ className, rows = 4, ...rest }: TextareaProps) {
  return (
    <textarea
      {...rest}
      rows={rows}
      className={[styles.textarea, className].filter(Boolean).join(' ')}
    />
  );
}
