import type { InputHTMLAttributes, ReactNode } from 'react';
import styles from './Choice.module.css';

interface RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
}

export function Radio({ label, className, ...rest }: RadioProps) {
  return (
    <label className={[styles.choice, className].filter(Boolean).join(' ')}>
      <span className={styles.control}>
        <input {...rest} type="radio" className={`${styles.input} ${styles.radio}`} />
        <span className={styles.dot} aria-hidden="true" />
      </span>
      <span className={styles.text}>{label}</span>
    </label>
  );
}

interface RadioGroupProps<V extends string> {
  legend: ReactNode;
  name: string;
  value: V;
  options: readonly { value: V; label: ReactNode; disabled?: boolean }[];
  onChange: (value: V) => void;
  /** Lay the options out in a row (wraps on small screens). */
  inline?: boolean;
}

/** A fieldset of radios with a visible legend; arrow keys move between options natively. */
export function RadioGroup<V extends string>({
  legend,
  name,
  value,
  options,
  onChange,
  inline = false,
}: RadioGroupProps<V>) {
  return (
    <fieldset className={styles.group}>
      <legend className={styles.legend}>{legend}</legend>
      <div className={inline ? styles.inlineOptions : styles.options}>
        {options.map((option) => (
          <Radio
            key={option.value}
            name={name}
            value={option.value}
            label={option.label}
            checked={option.value === value}
            disabled={option.disabled}
            onChange={() => {
              onChange(option.value);
            }}
          />
        ))}
      </div>
    </fieldset>
  );
}
