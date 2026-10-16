import styles from './BarList.module.css';

export interface BarListItem {
  key: string;
  label: string;
  value: number;
  /** The value as text (always visible, so the bar is never the only carrier). */
  display: string;
  /** Optional second line, e.g. "12 bileta". */
  detail?: string;
}

interface BarListProps {
  /** Accessible name of the list. */
  label: string;
  items: readonly BarListItem[];
  className?: string;
}

/** A ranked list with one horizontal bar per item (one series: no legend needed). */
export function BarList({ label, items, className }: BarListProps) {
  const max = Math.max(0, ...items.map((item) => item.value));
  return (
    <ol aria-label={label} className={[styles.list, className].filter(Boolean).join(' ')}>
      {items.map((item) => (
        <li key={item.key} className={styles.item}>
          <span className={styles.label}>{item.label}</span>
          <span className={styles.value}>{item.display}</span>
          <span className={styles.track} aria-hidden="true">
            <span
              className={styles.bar}
              style={{ width: `${String(max > 0 ? Math.max(0, (item.value / max) * 100) : 0)}%` }}
            />
          </span>
          {item.detail && <span className={styles.detail}>{item.detail}</span>}
        </li>
      ))}
    </ol>
  );
}
