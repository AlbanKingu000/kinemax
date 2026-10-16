import type { ReactNode } from 'react';
import styles from './DataTable.module.css';

interface DataTableProps {
  /** Visible or visually hidden caption: every table has an accessible name. */
  caption: string;
  hideCaption?: boolean;
  /** `<thead>` and `<tbody>` with `<th scope>` cells. */
  children: ReactNode;
  className?: string;
}

/**
 * A dense, accessible table for the admin panel. Wide tables scroll inside their own frame (which
 * is focusable for keyboard scrolling), never the whole page. Cells: `data-align="end"` for
 * numbers (tabular figures), `data-muted` for secondary text.
 */
export function DataTable({ caption, hideCaption = false, children, className }: DataTableProps) {
  return (
    <div
      className={[styles.frame, className].filter(Boolean).join(' ')}
      tabIndex={0}
      role="region"
      aria-label={caption}
    >
      <table className={styles.table}>
        <caption className={hideCaption ? 'visually-hidden' : styles.caption}>{caption}</caption>
        {children}
      </table>
    </div>
  );
}
