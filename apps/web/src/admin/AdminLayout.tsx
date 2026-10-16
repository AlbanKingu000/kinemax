import { useId, useState } from 'react';
import { Link as RouterLink, NavLink, Outlet, ScrollRestoration } from 'react-router';
import { useAuth } from '../auth/auth-context';
import { Button } from '../components/Button/Button';
import { Icon } from '../components/Icon/Icon';
import type { IconName } from '../components/Icon/icon-paths';
import { LanguageSwitch } from '../components/LanguageSwitch/LanguageSwitch';
import { Logo } from '../components/Logo/Logo';
import { Modal } from '../components/Modal/Modal';
import { Select } from '../components/Select/Select';
import { AccountMenu } from '../components/SiteHeader/AccountMenu';
import { usePageMeta } from '../hooks/use-page-meta';
import { useAdminMessages, type AdminMessages } from '../i18n/admin-messages';
import { useAdminLocation } from './admin-location';
import styles from './AdminLayout.module.css';

type NavKey = keyof AdminMessages['nav'];

interface NavItem {
  key: NavKey;
  icon: IconName;
  /** Missing: a later part of the panel, shown as "coming soon". */
  to?: string;
  superAdminOnly?: boolean;
}

const ADMIN_NAV: readonly NavItem[] = [
  { key: 'dashboard', icon: 'chart', to: '/admin' },
  { key: 'movies', icon: 'film', to: '/admin/movies', superAdminOnly: true },
  { key: 'showtimes', icon: 'calendar', to: '/admin/showtimes' },
  { key: 'halls', icon: 'seat', to: '/admin/halls' },
  { key: 'prices', icon: 'ticket', to: '/admin/prices', superAdminOnly: true },
  { key: 'food', icon: 'cup' },
  { key: 'scan', icon: 'scan' },
  { key: 'users', icon: 'user' },
];

function AdminNav({ onNavigate }: { onNavigate?: () => void }) {
  const a = useAdminMessages();
  const { user } = useAuth();
  const items = ADMIN_NAV.filter((item) => !item.superAdminOnly || user?.role === 'SUPER_ADMIN');
  return (
    <ul className={styles.navList}>
      {items.map((item) =>
        item.to ? (
          <li key={item.key}>
            <NavLink
              to={item.to}
              end={item.to === '/admin'}
              className={styles.navLink}
              onClick={onNavigate}
            >
              <Icon name={item.icon} size={18} />
              {a.nav[item.key]}
            </NavLink>
          </li>
        ) : (
          <li key={item.key}>
            <span className={styles.navLater} aria-disabled="true">
              <Icon name={item.icon} size={18} />
              {a.nav[item.key]}
              <span className={styles.laterTag}>{a.shell.later}</span>
            </span>
          </li>
        ),
      )}
    </ul>
  );
}

/** The cinema switcher of the top bar: a native select (keyboard and mobile friendly). */
function LocationSwitch() {
  const a = useAdminMessages();
  const id = useId();
  const { locations, selectedId, canSelectAll, select } = useAdminLocation();
  return (
    <div className={styles.location}>
      <label htmlFor={id} className={styles.locationLabel}>
        <Icon name="mapPin" size={16} />
        {a.shell.location}
      </label>
      <Select
        id={id}
        value={selectedId ?? ''}
        className={styles.locationSelect}
        onChange={(event) => {
          select(event.target.value === '' ? null : event.target.value);
        }}
      >
        {canSelectAll && <option value="">{a.shell.allLocations}</option>}
        {locations.map((location) => (
          <option key={location.id} value={location.id}>
            {location.name}
          </option>
        ))}
      </Select>
    </div>
  );
}

/**
 * The admin panel frame: a sidebar (a drawer below 1024 px), a top bar with the cinema switcher,
 * language, the account menu and "back to the site", and the page.
 */
export function AdminLayout() {
  const a = useAdminMessages();
  const { user } = useAuth();
  const [navOpen, setNavOpen] = useState(false);
  usePageMeta(`${a.meta.title} · Kinemax`, a.meta.title);
  const closeNav = () => {
    setNavOpen(false);
  };

  return (
    <div className={styles.shell}>
      <a href="#admin-main" className={styles.skip}>
        {a.shell.skip}
      </a>
      <aside className={styles.sidebar}>
        <RouterLink to="/admin" className={styles.brand} aria-label={a.meta.title}>
          <Logo variant="horizontal" className={styles.logo} title="Kinemax" />
        </RouterLink>
        <nav aria-label={a.shell.nav}>
          <AdminNav />
        </nav>
        {user && (
          <p className={styles.role}>
            {user.role === 'SUPER_ADMIN'
              ? a.shell.roles.SUPER_ADMIN
              : a.shell.roles.LOCATION_MANAGER}
          </p>
        )}
      </aside>

      <div className={styles.column}>
        <header className={styles.topbar}>
          <Button
            variant="icon"
            icon="menu"
            aria-label={a.shell.openNav}
            aria-haspopup="dialog"
            className={styles.navButton}
            onClick={() => {
              setNavOpen(true);
            }}
          />
          <LocationSwitch />
          <div className={styles.topActions}>
            <LanguageSwitch />
            <AccountMenu />
            <RouterLink to="/" className={styles.back}>
              <Icon name="chevronLeft" size={16} />
              <span className={styles.backText}>{a.shell.backToSite}</span>
            </RouterLink>
          </div>
        </header>
        <main id="admin-main" tabIndex={-1} className={styles.main}>
          <Outlet />
        </main>
      </div>

      <Modal open={navOpen} onClose={closeNav} title={a.shell.navTitle} variant="drawer">
        <nav aria-label={a.shell.nav}>
          <AdminNav onNavigate={closeNav} />
        </nav>
      </Modal>
      <ScrollRestoration />
    </div>
  );
}
