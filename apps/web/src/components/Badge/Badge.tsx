import type { ReactNode } from 'react';
import { useMessages } from '../../i18n/use-messages';
import styles from './Badge.module.css';
import {
  AGE_RATING_CODES,
  type AgeRating,
  type LanguageVersion,
  type MovieFormat,
} from './movie-labels';

export type BadgeTone = 'neutral' | 'crimson' | 'success' | 'warning' | 'error' | 'info';

interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}

/** Small status label. Not interactive. */
export function Badge({ tone = 'neutral', children, className }: BadgeProps) {
  return (
    <span className={[styles.badge, styles[tone], className].filter(Boolean).join(' ')}>
      {children}
    </span>
  );
}

const AGE_CLASS: Record<AgeRating, string | undefined> = {
  ALL: styles.ageAll,
  AGE_7: styles.age7,
  AGE_12: styles.age12,
  AGE_15: styles.age15,
  AGE_18: styles.age18,
};

/** Age rating symbol (ALL, 7+ … 18+); screen readers hear the full sentence instead. */
export function AgeBadge({ rating, className }: { rating: AgeRating; className?: string }) {
  const t = useMessages();
  return (
    <span className={[styles.age, AGE_CLASS[rating], className].filter(Boolean).join(' ')}>
      <span aria-hidden="true">{AGE_RATING_CODES[rating]}</span>
      <span className="visually-hidden">{t.movie.ageRatings[rating]}</span>
    </span>
  );
}

export function FormatBadge({ format }: { format: MovieFormat }) {
  return <span className={`${styles.badge} ${styles.format}`}>{format}</span>;
}

export function LanguageBadge({ version }: { version: LanguageVersion }) {
  const t = useMessages();
  return (
    <span className={`${styles.badge} ${styles.language}`}>
      {t.movie.languageVersions[version]}
    </span>
  );
}
