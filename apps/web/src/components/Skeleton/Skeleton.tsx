import type { CSSProperties } from 'react';
import styles from './Skeleton.module.css';

interface SkeletonProps {
  shape?: 'text' | 'rect' | 'circle';
  /** CSS length, e.g. '60%' or '12rem'. */
  width?: string;
  height?: string;
  /** Text shape only: number of lines (the last one is shorter). */
  lines?: number;
  className?: string;
}

/**
 * Placeholder while content loads. Decorative: the loading region itself should say that it is
 * busy (aria-busy plus a visually hidden status text).
 */
export function Skeleton({ shape = 'text', width, height, lines = 1, className }: SkeletonProps) {
  const style: CSSProperties = { width, height };
  const classes = [styles.skeleton, styles[shape], className].filter(Boolean).join(' ');
  if (shape === 'text' && lines > 1) {
    return (
      <span className={styles.lines} aria-hidden="true" style={{ width }}>
        {Array.from({ length: lines }, (_, i) => (
          <span
            key={i}
            className={classes}
            style={i === lines - 1 ? { width: '60%' } : undefined}
          />
        ))}
      </span>
    );
  }
  return <span className={classes} style={style} aria-hidden="true" />;
}

/** Skeleton in the shape of a MovieCard. */
export function MovieCardSkeleton() {
  return (
    <div className={styles.movieCard} aria-hidden="true">
      <Skeleton shape="rect" className={styles.poster} />
      <Skeleton width="80%" height="1.375rem" />
      <Skeleton width="55%" />
      <span className={styles.badgeRow}>
        <Skeleton shape="rect" width="2.5rem" height="1.5rem" />
        <Skeleton shape="rect" width="5.5rem" height="1.5rem" />
      </span>
    </div>
  );
}
