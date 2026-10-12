import type { MovieDetail } from '@kinemax/shared';
import { useParams } from 'react-router';
import { ApiRequestError, fetchMovie, fetchShowtimes } from '../api/catalog';
import { AgeBadge } from '../components/Badge/Badge';
import { AGE_RATING_CODES } from '../components/Badge/movie-labels';
import { Button } from '../components/Button/Button';
import { ChooseCinema } from '../components/ChooseCinema/ChooseCinema';
import { DayTabs } from '../components/DayTabs/DayTabs';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { Icon } from '../components/Icon/Icon';
import { Container } from '../components/Layout/Layout';
import { ShowtimeGroups } from '../components/ShowtimeGroups/ShowtimeGroups';
import { Skeleton } from '../components/Skeleton/Skeleton';
import { TrailerButton } from '../components/Trailer/TrailerButton';
import { useAsync } from '../hooks/use-async';
import { usePageMeta } from '../hooks/use-page-meta';
import { useScheduleParams } from '../hooks/use-schedule-params';
import { scheduleDays } from '../i18n/format';
import { formatReleaseDate, pickText } from '../i18n/messages';
import { useLocale, useMessages } from '../i18n/use-messages';
import { useLocationChoice } from '../location/location-context';
import styles from './MovieDetailPage.module.css';
import { NotFoundPage } from './NotFoundPage';

export function MovieDetailPage() {
  const t = useMessages();
  const { locale } = useLocale();
  const { slug = '' } = useParams();
  const movie = useAsync((signal) => fetchMovie(slug, signal), `movie:${slug}`);
  const notFound =
    movie.status === 'error' &&
    movie.error instanceof ApiRequestError &&
    movie.error.status === 404;
  const title =
    movie.status === 'ready' ? pickText(locale, movie.data.titleSq, movie.data.titleEn) : null;
  // Title and description once the movie is known (the 404 page sets its own).
  usePageMeta(
    title === null ? null : `${title} · ${t.meta.titleSuffix}`,
    movie.status === 'ready' ? pickText(locale, movie.data.synopsisSq, movie.data.synopsisEn) : '',
  );

  if (notFound) return <NotFoundPage />;
  if (movie.status === 'error') {
    return (
      <Container className={styles.message}>
        <h1 className="visually-hidden">{t.appName}</h1>
        <EmptyState
          icon="warning"
          tone="error"
          title={t.moviePage.loadError}
          action={
            <Button variant="secondary" onClick={movie.retry}>
              {t.common.retry}
            </Button>
          }
        />
      </Container>
    );
  }
  if (movie.status === 'loading') {
    return (
      <Container className={styles.message}>
        <div aria-busy="true">
          <p role="status" className="visually-hidden">
            {t.common.loading}
          </p>
          <div className={styles.loading} aria-hidden="true">
            <Skeleton shape="rect" className={styles.posterSkeleton} />
            <div className={styles.loadingText}>
              <Skeleton shape="rect" width="min(28rem, 90%)" height="4rem" />
              <Skeleton width="16rem" />
              <Skeleton lines={4} width="min(36rem, 100%)" />
            </div>
          </div>
        </div>
      </Container>
    );
  }
  return <MovieView movie={movie.data} title={title ?? movie.data.titleSq} />;
}

function MovieView({ movie, title }: { movie: MovieDetail; title: string }) {
  const t = useMessages();
  const { locale } = useLocale();
  const meta = [
    t.movie.duration(movie.durationMinutes),
    ...movie.genres.map((g) => t.movie.genres[g]),
  ];
  const needsId = movie.ageRating === 'AGE_15' || movie.ageRating === 'AGE_18';

  return (
    <>
      <section className={styles.hero} aria-labelledby="movie-title">
        {movie.backdropPath && (
          <img className={styles.backdrop} src={movie.backdropPath} alt="" decoding="async" />
        )}
        <Container className={styles.heroInner}>
          {movie.posterPath && (
            <img
              className={styles.poster}
              src={movie.posterPath}
              alt={t.movie.poster(title)}
              width={600}
              height={900}
              decoding="async"
            />
          )}
          <div className={styles.info}>
            <h1 id="movie-title" className={styles.title}>
              {title}
            </h1>
            <div className={styles.meta}>
              <AgeBadge rating={movie.ageRating} />
              <span>{meta.join(' · ')}</span>
            </div>
            <p className={styles.synopsis}>
              {pickText(locale, movie.synopsisSq, movie.synopsisEn)}
            </p>
            <dl className={styles.facts}>
              <div>
                <dt>{t.moviePage.releaseDate}</dt>
                <dd>{formatReleaseDate(locale, movie.releaseDate)}</dd>
              </div>
              <div>
                <dt>{t.moviePage.director}</dt>
                <dd>{movie.director}</dd>
              </div>
              {movie.cast.length > 0 && (
                <div>
                  <dt>{t.moviePage.cast}</dt>
                  <dd>{movie.cast.join(', ')}</dd>
                </div>
              )}
            </dl>
            {needsId && (
              <p className={styles.ageNote}>
                <Icon name="info" size={18} />
                {t.moviePage.ageNote(AGE_RATING_CODES[movie.ageRating])}
              </p>
            )}
            {movie.trailerYoutubeId && (
              <div className={styles.actions}>
                <TrailerButton youtubeId={movie.trailerYoutubeId} title={title} />
              </div>
            )}
          </div>
        </Container>
      </section>
      <MovieShowtimes movie={movie} />
    </>
  );
}

function MovieShowtimes({ movie }: { movie: MovieDetail }) {
  const t = useMessages();
  const { locale } = useLocale();
  const { selected, ready } = useLocationChoice();
  const days = selected ? scheduleDays(selected.timeZone) : [];
  const { date, setDate } = useScheduleParams(days);
  const enabled = selected !== null && date !== undefined && movie.status === 'NOW_SHOWING';
  const showtimes = useAsync(
    (signal) =>
      fetchShowtimes(
        { location: selected?.slug ?? '', date: date ?? '', movie: movie.slug },
        signal,
      ),
    `showtimes:${selected?.slug ?? ''}:${date ?? ''}:${movie.slug}`,
    enabled,
  );

  let content;
  if (movie.status === 'COMING_SOON') {
    content = (
      <EmptyState icon="calendar" title={t.moviePage.comingSoonTitle} headingLevel="h3">
        <p>{t.movie.releases(formatReleaseDate(locale, movie.releaseDate))}</p>
      </EmptyState>
    );
  } else if (!ready) {
    content = <Skeleton shape="rect" height="8rem" />;
  } else if (!selected || date === undefined) {
    content = <ChooseCinema headingLevel="h3" />;
  } else {
    const groups = showtimes.status === 'ready' ? (showtimes.data.movies[0]?.groups ?? []) : [];
    content = (
      <DayTabs days={days} selected={date} onSelect={setDate}>
        {showtimes.status === 'loading' && (
          <div aria-busy="true">
            <p role="status" className="visually-hidden">
              {t.showtimes.loading}
            </p>
            <Skeleton shape="rect" height="6rem" />
          </div>
        )}
        {showtimes.status === 'error' && (
          <EmptyState
            icon="warning"
            tone="error"
            title={t.showtimes.error}
            action={
              <Button variant="secondary" onClick={showtimes.retry}>
                {t.common.retry}
              </Button>
            }
          />
        )}
        {showtimes.status === 'ready' &&
          (groups.length > 0 ? (
            <ShowtimeGroups groups={groups} />
          ) : (
            <EmptyState icon="calendar" title={t.showtimes.noneForDay}>
              <p>{t.showtimes.noneForDayBody}</p>
            </EmptyState>
          ))}
      </DayTabs>
    );
  }

  return (
    <Container as="section" className={styles.showtimes}>
      <div className={styles.showtimesHeading}>
        <h2 id="showtimes-title">{t.showtimes.heading}</h2>
        {selected && movie.status === 'NOW_SHOWING' && (
          <p className={styles.subtitle}>{t.home.atLocation(selected.city)}</p>
        )}
      </div>
      {content}
    </Container>
  );
}
