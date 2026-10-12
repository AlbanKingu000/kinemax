import { Outlet, ScrollRestoration, useLocation } from 'react-router';
import { useMessages } from '../../i18n/use-messages';
import { LocationPicker } from '../LocationPicker/LocationPicker';
import { SiteFooter } from '../SiteFooter/SiteFooter';
import { SiteHeader } from '../SiteHeader/SiteHeader';
import styles from './AppShell.module.css';

/** Layout of every public page: skip link, header, page, footer and the cinema picker. */
export function AppShell() {
  const t = useMessages();
  const { pathname } = useLocation();
  return (
    <div className={styles.shell}>
      <a href="#main" className={styles.skip}>
        {t.nav.skip}
      </a>
      {/* Only the home page has a hero under the header. */}
      <SiteHeader transparentAtTop={pathname === '/'} />
      <main id="main" tabIndex={-1} className={styles.main}>
        <Outlet />
      </main>
      <SiteFooter />
      <LocationPicker />
      <ScrollRestoration />
    </div>
  );
}
