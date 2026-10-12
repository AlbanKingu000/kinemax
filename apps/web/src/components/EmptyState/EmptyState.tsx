import type { ReactNode } from 'react';
import { Icon } from '../Icon/Icon';
import type { IconName } from '../Icon/icon-paths';
import styles from './EmptyState.module.css';

interface EmptyStateProps {
  icon?: IconName;
  /** `error` tints the icon; the text stays neutral and friendly. */
  tone?: 'neutral' | 'error';
  title: string;
  children?: ReactNode;
  /** Buttons or links (retry, go home, change cinema). */
  action?: ReactNode;
  /** Small label above the title (e.g. "Coming soon"). */
  eyebrow?: string;
  /** Heading level of the title; `h1` for whole-page states. */
  headingLevel?: 'h1' | 'h2' | 'h3';
  className?: string;
}

/** A calm, centered message for empty results, errors and pages that are not built yet. */
export function EmptyState({
  icon = 'film',
  tone = 'neutral',
  title,
  children,
  action,
  eyebrow,
  headingLevel: Heading = 'h3',
  className,
}: EmptyStateProps) {
  return (
    <div className={[styles.root, styles[tone], className].filter(Boolean).join(' ')}>
      <span className={styles.icon}>
        <Icon name={icon} size={28} />
      </span>
      {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
      <Heading className={Heading === 'h1' ? styles.pageTitle : styles.title}>{title}</Heading>
      {children && <div className={styles.body}>{children}</div>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
