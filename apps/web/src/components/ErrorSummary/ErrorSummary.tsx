import { useEffect, useRef } from 'react';
import { Icon } from '../Icon/Icon';
import styles from './ErrorSummary.module.css';

export interface SummaryError {
  /** Id of the field the error belongs to (a link jumps there), or none for a general error. */
  fieldId?: string;
  message: string;
}

interface ErrorSummaryProps {
  title: string;
  errors: readonly SummaryError[];
  /** Changes on every failed submit, so focus moves here again even with the same errors. */
  attempt: number;
}

/**
 * Error summary at the top of a form (GOV.UK pattern): it takes focus after a failed submit, so
 * screen readers announce it, and every field error links to its field.
 */
export function ErrorSummary({ title, errors, attempt }: ErrorSummaryProps) {
  const ref = useRef<HTMLDivElement>(null);
  const hasErrors = errors.length > 0;

  useEffect(() => {
    if (hasErrors) ref.current?.focus();
  }, [attempt, hasErrors]);

  if (!hasErrors) return null;
  return (
    <div ref={ref} className={styles.summary} role="alert" tabIndex={-1}>
      <p className={styles.title}>
        <Icon name="error" size={18} />
        {title}
      </p>
      <ul className={styles.list}>
        {errors.map((error) => (
          <li key={`${error.fieldId ?? ''}-${error.message}`}>
            {error.fieldId ? (
              <a
                href={`#${error.fieldId}`}
                onClick={(event) => {
                  event.preventDefault();
                  document.getElementById(error.fieldId ?? '')?.focus();
                }}
              >
                {error.message}
              </a>
            ) : (
              error.message
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
