import type { ReactNode } from 'react';
import styles from './StatTile.module.css';

interface StatTileProps {
  /** Sentence case, no trailing colon. */
  label: string;
  value: ReactNode;
  /** Optional line under the value (a split, a comparison). */
  detail?: ReactNode;
  className?: string;
}

/** A key figure of a dashboard: label, value and an optional detail line. */
export function StatTile({ label, value, detail, className }: StatTileProps) {
  return (
    <div className={[styles.tile, className].filter(Boolean).join(' ')}>
      <p className={styles.label}>{label}</p>
      <p className={styles.value}>{value}</p>
      {detail && <p className={styles.detail}>{detail}</p>}
    </div>
  );
}
