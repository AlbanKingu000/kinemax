import type { ShowtimeGroup } from '@kinemax/shared';
import { Link as RouterLink } from 'react-router';
import { formatPrice } from '../../i18n/format';
import { pickText } from '../../i18n/messages';
import { useLocale, useMessages } from '../../i18n/use-messages';
import { FormatBadge, LanguageBadge } from '../Badge/Badge';
import styles from './ShowtimeGroups.module.css';

interface ShowtimeGroupsProps {
  groups: readonly ShowtimeGroup[];
  /** Heading level of each group's hall type. */
  headingLevel?: 'h3' | 'h4';
}

/**
 * Showtimes of one movie grouped by hall type + format + language: a header with badges and the
 * "from" price, then one button per time. Every bookable time links to /booking/:id; FEW_LEFT is
 * marked, SOLD_OUT is shown but disabled.
 */
export function ShowtimeGroups({ groups, headingLevel: Heading = 'h3' }: ShowtimeGroupsProps) {
  const t = useMessages();
  const { locale } = useLocale();

  return (
    <div className={styles.groups}>
      {groups.map((group) => {
        const hallType = pickText(locale, group.hallType.nameSq, group.hallType.nameEn);
        const price = group.fromPrice
          ? group.fromPrice.kind === 'WHOLE_HALL'
            ? t.showtimes.wholeSuite(formatPrice(locale, group.fromPrice.amountCents))
            : t.showtimes.fromPrice(formatPrice(locale, group.fromPrice.amountCents))
          : null;
        return (
          <section
            key={`${group.hallType.code}-${group.format}-${group.languageVersion}`}
            className={styles.group}
          >
            <header className={styles.header}>
              <Heading className={styles.hallType}>{hallType}</Heading>
              <FormatBadge format={group.format} />
              <LanguageBadge version={group.languageVersion} />
              {price && <p className={styles.price}>{price}</p>}
            </header>
            <ul className={styles.times}>
              {group.showtimes.map((show) => {
                const status = t.showtimes.availability[show.availability];
                const content = (
                  <>
                    <span className={styles.time}>{show.startTime}</span>
                    <span className={styles.meta}>
                      {show.availability === 'AVAILABLE' ? show.hallName : status}
                    </span>
                  </>
                );
                const label = t.showtimes.timeLabel(
                  show.startTime,
                  t.showtimes.hall(show.hallName),
                  status,
                );
                return (
                  <li key={show.id}>
                    {show.availability === 'SOLD_OUT' ? (
                      <span
                        className={styles.slot}
                        data-availability={show.availability}
                        role="link"
                        aria-disabled="true"
                        aria-label={label}
                      >
                        {content}
                      </span>
                    ) : (
                      <RouterLink
                        to={`/booking/${show.id}`}
                        className={styles.slot}
                        data-availability={show.availability}
                        aria-label={label}
                      >
                        {content}
                      </RouterLink>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
