import type { CSSProperties, ReactNode } from 'react';
import styles from './Layout.module.css';

interface ContainerProps {
  as?: 'div' | 'section' | 'main' | 'header' | 'footer';
  /** Narrow reading width (760 px) instead of the full 1280 px. */
  narrow?: boolean;
  className?: string;
  id?: string;
  children: ReactNode;
}

/** Centers content with the responsive side gutter. */
export function Container({
  as: Element = 'div',
  narrow = false,
  className,
  id,
  children,
}: ContainerProps) {
  return (
    <Element
      id={id}
      className={[styles.container, narrow && styles.narrow, className].filter(Boolean).join(' ')}
    >
      {children}
    </Element>
  );
}

interface GridProps {
  as?: 'div' | 'ul' | 'ol';
  /** Smallest column width; as many columns as fit (e.g. '12rem' for movie posters). */
  min?: string;
  gap?: 'sm' | 'md' | 'lg';
  className?: string;
  children: ReactNode;
}

/** Responsive auto-fill grid: no breakpoints needed, columns appear as space allows. */
export function Grid({
  as: Element = 'div',
  min = '14rem',
  gap = 'md',
  className,
  children,
}: GridProps) {
  return (
    <Element
      className={[styles.grid, styles[gap], className].filter(Boolean).join(' ')}
      style={{ '--grid-min': min } as CSSProperties}
    >
      {children}
    </Element>
  );
}
