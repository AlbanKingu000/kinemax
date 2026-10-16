import styles from './FillBar.module.css';

interface FillBarProps {
  value: number;
  max: number;
  /** Accessible name, e.g. "Fillimi i sallës". */
  label: string;
  className?: string;
}

/** How full something is (a show's seats): a thin bar plus the percentage as text. */
export function FillBar({ value, max, label, className }: FillBarProps) {
  const percent = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <span className={[styles.root, className].filter(Boolean).join(' ')}>
      <span
        className={styles.track}
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={`${String(percent)}%`}
      >
        <span className={styles.fill} style={{ width: `${String(Math.min(percent, 100))}%` }} />
      </span>
      <span className={styles.text} aria-hidden="true">
        {percent}%
      </span>
    </span>
  );
}
