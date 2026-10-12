import { useState, type InputHTMLAttributes, type Ref } from 'react';
import { useMessages } from '../../i18n/use-messages';
import { Icon } from '../Icon/Icon';
import inputStyles from '../Input/Input.module.css';
import styles from './PasswordInput.module.css';

interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** "current-password" for sign-in, "new-password" when choosing one (password managers). */
  autoComplete: 'current-password' | 'new-password';
  ref?: Ref<HTMLInputElement>;
}

/**
 * Password field with a show/hide toggle. Pasting is allowed (password managers). The toggle is a
 * real button with a pressed state, so screen readers know whether the password is visible.
 */
export function PasswordInput({ className, ...rest }: PasswordInputProps) {
  const t = useMessages();
  const [visible, setVisible] = useState(false);
  return (
    <span className={styles.wrapper}>
      <input
        {...rest}
        type={visible ? 'text' : 'password'}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className={[inputStyles.input, styles.input, className].filter(Boolean).join(' ')}
      />
      <button
        type="button"
        className={styles.toggle}
        aria-pressed={visible}
        aria-label={visible ? t.auth.hidePassword : t.auth.showPassword}
        onClick={() => {
          setVisible((v) => !v);
        }}
      >
        <Icon name={visible ? 'eyeOff' : 'eye'} size={18} />
      </button>
    </span>
  );
}
