import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { useMessages } from '../../i18n/use-messages';
import { Icon } from '../Icon/Icon';
import type { IconName } from '../Icon/icon-paths';
import { Spinner } from '../Spinner/Spinner';
import styles from './Button.module.css';

export type ButtonSize = 'sm' | 'md' | 'lg';

interface BaseProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  size?: ButtonSize;
  /** Shows a spinner, sets aria-busy and blocks clicks. */
  loading?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

interface TextButtonProps extends BaseProps {
  variant?: 'primary' | 'secondary' | 'ghost';
  children: ReactNode;
  /** Icon before the label. */
  icon?: IconName;
  /** Icon after the label. */
  iconEnd?: IconName;
}

interface IconButtonProps extends BaseProps {
  variant: 'icon';
  icon: IconName;
  /** Required: an icon-only button needs an accessible name. */
  'aria-label': string;
  children?: never;
  iconEnd?: never;
}

export type ButtonProps = TextButtonProps | IconButtonProps;

const ICON_SIZE: Record<ButtonSize, number> = { sm: 16, md: 18, lg: 20 };

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className,
  type = 'button',
  icon,
  iconEnd,
  children,
  ...rest
}: ButtonProps) {
  const t = useMessages();
  const iconSize = ICON_SIZE[size];
  const textButton = variant !== 'icon';

  return (
    <button
      {...rest}
      type={type}
      className={[styles.button, styles[variant], styles[size], className]
        .filter(Boolean)
        .join(' ')}
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
    >
      {loading ? <Spinner /> : icon && <Icon name={icon} size={iconSize} />}
      {textButton && <span className={styles.label}>{children}</span>}
      {textButton && !loading && iconEnd && <Icon name={iconEnd} size={iconSize} />}
      {loading && <span className="visually-hidden">{t.common.loading}</span>}
    </button>
  );
}
