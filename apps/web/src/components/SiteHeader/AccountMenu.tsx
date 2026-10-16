import { useEffect, useId, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router';
import { useAuth } from '../../auth/auth-context';
import { firstName, isStaff } from '../../auth/helpers';
import { useSignOut } from '../../auth/use-sign-out';
import { useMessages } from '../../i18n/use-messages';
import { Icon } from '../Icon/Icon';
import styles from './AccountMenu.module.css';

/**
 * Header account menu: "Hyr" when signed out; when signed in a disclosure button with the first
 * name that opens "Llogaria ime", "Biletat e mia", "Paneli admin" (staff only) and "Dil". Escape and a click outside close it.
 */
export function AccountMenu({ className }: { className?: string }) {
  const t = useMessages();
  const { status, user } = useAuth();
  const signOut = useSignOut();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Close after navigating somewhere.
  const [shownFor, setShownFor] = useState(pathname);
  if (shownFor !== pathname) {
    setShownFor(pathname);
    setOpen(false);
  }

  if (status !== 'authenticated' || !user) {
    return (
      <NavLink to="/login" className={[styles.login, className].filter(Boolean).join(' ')}>
        {t.nav.login}
      </NavLink>
    );
  }

  return (
    <div ref={rootRef} className={[styles.root, className].filter(Boolean).join(' ')}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.button}
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={t.account.menuLabel(user.name)}
        onClick={() => {
          setOpen((value) => !value);
        }}
      >
        <Icon name="user" size={18} className={styles.icon} />
        <span>{firstName(user.name)}</span>
        <Icon name="chevronDown" size={16} className={styles.chevron} />
      </button>
      {open && (
        <ul id={menuId} className={styles.menu}>
          <li>
            <NavLink to="/account" end className={styles.item}>
              <Icon name="user" size={18} />
              {t.account.myAccount}
            </NavLink>
          </li>
          <li>
            <NavLink to="/account/tickets" className={styles.item}>
              <Icon name="ticket" size={18} />
              {t.account.myTickets}
            </NavLink>
          </li>
          {isStaff(user) && (
            <li>
              <NavLink to="/admin" className={styles.item}>
                <Icon name="seat" size={18} />
                {t.account.admin}
              </NavLink>
            </li>
          )}
          <li>
            <button
              type="button"
              className={styles.item}
              onClick={() => {
                setOpen(false);
                void signOut();
              }}
            >
              <Icon name="logout" size={18} />
              {t.account.logout}
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
