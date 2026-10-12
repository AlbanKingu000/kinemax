import { useId, type ReactNode } from 'react';
import { useMessages } from '../../i18n/use-messages';
import { Icon } from '../Icon/Icon';
import styles from './FormField.module.css';

/** Props a FormField hands to its control so label, hint and error are connected. */
export interface FieldControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
  required?: boolean;
}

interface FormFieldProps {
  label: ReactNode;
  hint?: ReactNode;
  /** Error text; marks the control invalid and is read with it. */
  error?: ReactNode;
  required?: boolean;
  /** Adds "(optional)" to the label. */
  optional?: boolean;
  className?: string;
  /** Id of the control (default: generated), e.g. for links from an error summary. */
  id?: string;
  children: (control: FieldControlProps) => ReactNode;
}

/**
 * Label + control + hint + error with the aria wiring done once:
 * `<FormField label="Email">{(props) => <Input {...props} type="email" />}</FormField>`
 */
export function FormField({
  label,
  hint,
  error,
  required,
  optional,
  className,
  id: givenId,
  children,
}: FormFieldProps) {
  const t = useMessages();
  const generatedId = useId();
  const id = givenId ?? generatedId;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={[styles.field, className].filter(Boolean).join(' ')}>
      <label className={styles.label} htmlFor={id}>
        {label}
        {required && (
          <span className={styles.required} aria-hidden="true">
            {' '}
            *
          </span>
        )}
        {optional && (
          <>
            {' '}
            <span className={styles.optional}>({t.common.optional})</span>
          </>
        )}
      </label>
      {children({
        id,
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
        ...(error ? { 'aria-invalid': true as const } : {}),
        ...(required ? { required: true } : {}),
      })}
      {hint && (
        <p className={styles.hint} id={hintId}>
          {hint}
        </p>
      )}
      {error && (
        <p className={styles.error} id={errorId}>
          <Icon name="error" size={16} />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
