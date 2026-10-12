import { useParams } from 'react-router';
import { ApiRequestError, fetchShowtime } from '../api/catalog';
import { AgeBadge, FormatBadge, LanguageBadge } from '../components/Badge/Badge';
import { Button, ButtonLink } from '../components/Button/Button';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { Container } from '../components/Layout/Layout';
import { Skeleton } from '../components/Skeleton/Skeleton';
import { useAsync } from '../hooks/use-async';
import { usePageMeta } from '../hooks/use-page-meta';
import { formatLongDate } from '../i18n/format';
import { pickText } from '../i18n/messages';
import { useLocale, useMessages } from '../i18n/use-messages';
import styles from './BookingPage.module.css';

/** Placeholder for the booking flow: a summary of the chosen show. Seat selection comes next. */
export function BookingPage() {
  const t = useMessages();
  const { locale } = useLocale();
  const { showtimeId = '' } = useParams();
  const show = useAsync((signal) => fetchShowtime(showtimeId, signal), `showtime:${showtimeId}`);
  usePageMeta(`${t.booking.title} · ${t.meta.titleSuffix}`, t.booking.seatsSoonBody);

  if (show.status === 'loading') {
    return (
      <Container narrow className={styles.page}>
        <div aria-busy="true">
          <p role="status" className="visually-hidden">
            {t.common.loading}
          </p>
          <Skeleton shape="rect" height="20rem" />
        </div>
      </Container>
    );
  }
  if (show.status === 'error') {
    const missing =
      show.error instanceof ApiRequestError &&
      (show.error.status === 404 || show.error.status === 400);
    return (
      <Container narrow className={styles.page}>
        <EmptyState
          icon={missing ? 'search' : 'warning'}
          tone={missing ? 'neutral' : 'error'}
          title={missing ? t.booking.notFoundTitle : t.booking.loadError}
          headingLevel="h1"
          action={
            missing ? (
              <ButtonLink to="/schedule" icon="calendar">
                {t.booking.backToSchedule}
              </ButtonLink>
            ) : (
              <Button variant="secondary" onClick={show.retry}>
                {t.common.retry}
              </Button>
            )
          }
        >
          {missing && <p>{t.booking.notFoundBody}</p>}
        </EmptyState>
      </Container>
    );
  }

  const s = show.data;
  const title = pickText(locale, s.movie.titleSq, s.movie.titleEn);
  if (s.hasStarted) {
    return (
      <Container narrow className={styles.page}>
        <EmptyState
          icon="clock"
          title={t.booking.startedTitle}
          headingLevel="h1"
          action={
            <ButtonLink to={`/movies/${s.movie.slug}`} icon="calendar">
              {t.booking.otherTimes}
            </ButtonLink>
          }
        >
          <p>{t.booking.startedBody}</p>
        </EmptyState>
      </Container>
    );
  }

  return (
    <Container narrow className={styles.page}>
      <h1 className={styles.title}>{t.booking.title}</h1>
      <section className={styles.summary} aria-labelledby="booking-summary">
        <h2 id="booking-summary" className="visually-hidden">
          {t.booking.summary}
        </h2>
        {s.movie.posterPath && (
          <img
            className={styles.poster}
            src={s.movie.posterPath}
            alt={t.movie.poster(title)}
            width={600}
            height={900}
            decoding="async"
          />
        )}
        <div className={styles.details}>
          <p className={styles.movieTitle}>{title}</p>
          <div className={styles.badges}>
            <AgeBadge rating={s.movie.ageRating} />
            <FormatBadge format={s.format} />
            <LanguageBadge version={s.languageVersion} />
          </div>
          <dl className={styles.facts}>
            <div>
              <dt>{t.booking.cinema}</dt>
              <dd>
                {s.location.name}
                <span className={styles.secondary}>{s.location.address}</span>
              </dd>
            </div>
            <div>
              <dt>{t.booking.hall}</dt>
              <dd>
                {s.hall.name}
                <span className={styles.secondary}>
                  {pickText(locale, s.hall.hallType.nameSq, s.hall.hallType.nameEn)}
                </span>
              </dd>
            </div>
            <div>
              <dt>{t.booking.date}</dt>
              <dd>{formatLongDate(locale, t, s.date)}</dd>
            </div>
            <div>
              <dt>{t.booking.time}</dt>
              <dd>
                {s.startTime}–{s.endTime}
              </dd>
            </div>
          </dl>
        </div>
      </section>
      <EmptyState
        icon="seat"
        eyebrow={t.comingSoon.badge}
        title={t.booking.seatsSoonTitle}
        headingLevel="h2"
      >
        <p>{t.booking.seatsSoonBody}</p>
      </EmptyState>
    </Container>
  );
}
