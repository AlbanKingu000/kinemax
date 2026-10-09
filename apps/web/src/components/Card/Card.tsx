import type { ReactNode } from 'react';
import styles from './Card.module.css';

interface CardProps {
  as?: 'div' | 'article' | 'section' | 'li';
  variant?: 'surface' | 'elevated' | 'outline';
  padding?: 'sm' | 'md' | 'lg';
  /** Lift and glow on hover (use when the card contains its own link or button). */
  interactive?: boolean;
  className?: string;
  children: ReactNode;
}

export function Card({
  as: Element = 'div',
  variant = 'surface',
  padding = 'md',
  interactive = false,
  className,
  children,
}: CardProps) {
  return (
    <Element
      className={[
        styles.card,
        styles[variant],
        styles[padding],
        interactive && styles.interactive,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </Element>
  );
}
