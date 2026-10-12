import type { MovieSummary } from '@kinemax/shared';
import type { ReactNode } from 'react';
import type { AsyncState } from '../../hooks/use-async';
import { formatReleaseDate, pickText } from '../../i18n/messages';
import { useLocale, useMessages } from '../../i18n/use-messages';
import { Button } from '../Button/Button';
import { EmptyState } from '../EmptyState/EmptyState';
import { Container } from '../Layout/Layout';
import { MovieCard } from '../MovieCard/MovieCard';
import { MovieCardSkeleton } from '../Skeleton/Skeleton';
import styles from './MovieRail.module.css';

interface MovieRailProps {
  id: string;
  title: string;
  /** Small line under the title, e.g. which cinema the list is for. */
  subtitle?: string;
  state: AsyncState<MovieSummary[]>;
  onRetry: () => void;
  /** Shown when the list loaded but is empty. */
  empty: ReactNode;
  /** Coming soon: show the release date on each card. */
  showRelease?: boolean;
}

/**
 * A titled list of MovieCards: a responsive grid on wide screens, a horizontal, swipeable row on
 * phones (every card is a link, so Tab walks through it and scrolls it). Handles loading, error
 * and empty states.
 */
export function MovieRail({
  id,
  title,
  subtitle,
  state,
  onRetry,
  empty,
  showRelease = false,
}: MovieRailProps) {
  const t = useMessages();
  const { locale } = useLocale();
  const titleId = `${id}-title`;

  return (
    <section id={id} aria-labelledby={titleId} className={styles.section}>
      <Container>
        <div className={styles.heading}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>

        {state.status === 'loading' && (
          <div aria-busy="true">
            <p role="status" className="visually-hidden">
              {t.home.loadingMovies}
            </p>
            <ul className={styles.list} aria-hidden="true">
              {[1, 2, 3, 4, 5].map((n) => (
                <li key={n}>
                  <MovieCardSkeleton />
                </li>
              ))}
            </ul>
          </div>
        )}

        {state.status === 'error' && (
          <EmptyState
            icon="warning"
            tone="error"
            title={t.home.moviesError}
            action={
              <Button variant="secondary" onClick={onRetry}>
                {t.common.retry}
              </Button>
            }
          />
        )}

        {state.status === 'ready' && state.data.length === 0 && empty}

        {state.status === 'ready' && state.data.length > 0 && (
          <ul className={styles.list}>
            {state.data.map((movie) => (
              <li key={movie.slug}>
                <MovieCard
                  title={pickText(locale, movie.titleSq, movie.titleEn)}
                  to={`/movies/${movie.slug}`}
                  {...(movie.posterPath ? { posterSrc: movie.posterPath } : {})}
                  ageRating={movie.ageRating}
                  durationMinutes={movie.durationMinutes}
                  genres={movie.genres.map((genre) => t.movie.genres[genre])}
                  formats={movie.formats}
                  {...(showRelease
                    ? {
                        releaseLabel: t.movie.releases(
                          formatReleaseDate(locale, movie.releaseDate),
                        ),
                      }
                    : {})}
                />
              </li>
            ))}
          </ul>
        )}
      </Container>
    </section>
  );
}
