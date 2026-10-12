import { useState, useSyncExternalStore } from 'react';
import { Link as RouterLink, NavLink } from 'react-router';
import { useMessages } from '../../i18n/use-messages';
import { Button, ButtonLink } from '../Button/Button';
import { LanguageSwitch } from '../LanguageSwitch/LanguageSwitch';
import { Container } from '../Layout/Layout';
import { LocationButton } from '../LocationPicker/LocationButton';
import { Logo } from '../Logo/Logo';
import { Modal } from '../Modal/Modal';
import { BUY_TICKET_PATH, NAV_ITEMS } from './nav-items';
import styles from './SiteHeader.module.css';

const SCROLL_THRESHOLD = 16;

function subscribeScroll(onChange: () => void) {
  window.addEventListener('scroll', onChange, { passive: true });
  return () => {
    window.removeEventListener('scroll', onChange);
  };
}
const isScrolled = () => window.scrollY > SCROLL_THRESHOLD;

interface SiteHeaderProps {
  /** Transparent while the page is at the top (over a hero); solid as soon as it scrolls. */
  transparentAtTop?: boolean;
}

/**
 * Sticky site header. From the desktop breakpoint up: logo, main navigation, cinema, language,
 * sign in and "Buy tickets". Below it the navigation and the other controls move into a drawer.
 */
export function SiteHeader({ transparentAtTop = false }: SiteHeaderProps) {
  const t = useMessages();
  const scrolled = useSyncExternalStore(subscribeScroll, isScrolled, () => false);
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => {
    setMenuOpen(false);
  };
  const solid = scrolled || !transparentAtTop;

  return (
    <header className={styles.header} data-solid={solid}>
      <Container className={styles.inner}>
        <RouterLink to="/" className={styles.logoLink} aria-label={t.nav.home}>
          <Logo variant="horizontal" className={styles.logo} title="Kinemax" />
        </RouterLink>

        <nav aria-label={t.nav.main} className={styles.nav}>
          <ul className={styles.navList}>
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to} className={styles.navLink}>
                  {t.nav[item.key]}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className={styles.actions}>
          <div className={styles.desktopOnly}>
            <LocationButton />
            <LanguageSwitch />
            <NavLink to="/login" className={styles.login}>
              {t.nav.login}
            </NavLink>
          </div>
          <ButtonLink to={BUY_TICKET_PATH} icon="ticket" size="sm" className={styles.cta}>
            {t.nav.buyTicket}
          </ButtonLink>
          <Button
            variant="icon"
            icon="menu"
            aria-label={t.nav.openMenu}
            aria-haspopup="dialog"
            className={styles.menuButton}
            onClick={() => {
              setMenuOpen(true);
            }}
          />
        </div>
      </Container>

      <Modal open={menuOpen} onClose={closeMenu} title={t.nav.menu} variant="drawer">
        <div className={styles.drawer}>
          <nav aria-label={t.nav.main}>
            <ul className={styles.drawerList}>
              {NAV_ITEMS.map((item) => (
                <li key={item.to}>
                  <NavLink to={item.to} className={styles.drawerLink} onClick={closeMenu}>
                    {t.nav[item.key]}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className={styles.drawerControls}>
            <LocationButton block />
            <LanguageSwitch />
            <NavLink to="/login" className={styles.login} onClick={closeMenu}>
              {t.nav.login}
            </NavLink>
            <ButtonLink to={BUY_TICKET_PATH} icon="ticket" onClick={closeMenu}>
              {t.nav.buyTicket}
            </ButtonLink>
          </div>
        </div>
      </Modal>
    </header>
  );
}
