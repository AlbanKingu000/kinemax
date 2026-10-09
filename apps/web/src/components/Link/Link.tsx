import type { ReactNode } from 'react';
import { Link as RouterLink, type LinkProps as RouterLinkProps } from 'react-router';
import { Icon } from '../Icon/Icon';
import styles from './Link.module.css';

interface LinkProps extends Omit<RouterLinkProps, 'className'> {
  /** `inline` inside running text, `standalone` for "see all" style links with an arrow. */
  variant?: 'inline' | 'standalone';
  className?: string;
  children: ReactNode;
}

/** In-app link (client-side navigation) in the Kinemax style. */
export function Link({ variant = 'inline', className, children, ...rest }: LinkProps) {
  return (
    <RouterLink
      {...rest}
      className={[styles.link, styles[variant], className].filter(Boolean).join(' ')}
    >
      {variant === 'standalone' ? (
        <>
          <span>{children}</span>
          <Icon name="arrowRight" size={16} className={styles.arrow} />
        </>
      ) : (
        children
      )}
    </RouterLink>
  );
}
