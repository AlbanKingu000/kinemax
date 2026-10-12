import { Link as RouterLink } from 'react-router';
import { useMessages } from '../../i18n/use-messages';
import { useLocationChoice } from '../../location/location-context';
import { LanguageSwitch } from '../LanguageSwitch/LanguageSwitch';
import { Container } from '../Layout/Layout';
import { Logo } from '../Logo/Logo';
import { NAV_ITEMS } from '../SiteHeader/nav-items';
import styles from './SiteFooter.module.css';

export function SiteFooter() {
  const t = useMessages();
  const { locations } = useLocationChoice();
  return (
    <footer className={styles.footer}>
      <Container className={styles.grid}>
        <div className={styles.brand}>
          <RouterLink to="/" className={styles.logoLink} aria-label={t.nav.home}>
            <Logo variant="horizontal" className={styles.logo} />
          </RouterLink>
          <LanguageSwitch />
        </div>

        <nav aria-label={t.nav.footer}>
          <ul className={styles.links}>
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <RouterLink to={item.to} className={styles.link}>
                  {t.nav[item.key]}
                </RouterLink>
              </li>
            ))}
            <li>
              <RouterLink to="/login" className={styles.link}>
                {t.nav.login}
              </RouterLink>
            </li>
          </ul>
        </nav>

        {locations.status === 'ready' && locations.data.length > 0 && (
          <section aria-labelledby="footer-locations" className={styles.locations}>
            <h2 id="footer-locations" className={styles.heading}>
              {t.footer.locations}
            </h2>
            <ul className={styles.locationList}>
              {locations.data.map((location) => (
                <li key={location.slug}>
                  <p className={styles.city}>{location.name}</p>
                  <address className={styles.address}>{location.address}</address>
                </li>
              ))}
            </ul>
          </section>
        )}
      </Container>

      <Container className={styles.bottom}>
        <p>{t.footer.note}</p>
        <p>{t.footer.copyright(new Date().getFullYear())}</p>
      </Container>
    </footer>
  );
}
