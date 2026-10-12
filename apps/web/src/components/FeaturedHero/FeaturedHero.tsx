import type { FeaturedMovie } from '@kinemax/shared';
import { useId } from 'react';
import type { AsyncState } from '../../hooks/use-async';
import { pickText } from '../../i18n/messages';
import { useLocale, useMessages } from '../../i18n/use-messages';
import { AgeBadge, FormatBadge, LanguageBadge } from '../Badge/Badge';
import { Button, ButtonLink } from '../Button/Button';
import { EmptyState } from '../EmptyState/EmptyState';
import { HeroBackground } from '../HeroBackground/HeroBackground';
import { Container } from '../Layout/Layout';
import { Skeleton } from '../Skeleton/Skeleton';
import { TrailerButton } from '../Trailer/TrailerButton';
import styles from './FeaturedHero.module.css';

interface FeaturedHeroProps {
  state: AsyncState<FeaturedMovie | null>;
  onRetry: () => void;
  /** The home page uses h1; the styleguide demo uses h2. */
  titleTag?: 'h1' | 'h2';
}

/**
 * Home page hero over the cinema background: the featured movie with badges, a short synopsis,
 * "Buy tickets" and (when there is one) a trailer that loads from youtube-nocookie.com only after
 * the click. The page's h1 lives here in every state.
 */
export function FeaturedHero({ state, onRetry, titleTag: Title = 'h1' }: FeaturedHeroProps) {
  const t = useMessages();
  const titleId = useId();

  return (
    <section className={styles.hero} aria-labelledby={titleId}>
      <HeroBackground />
      <Container className={styles.inner}>
        {state.status === 'loading' && (
          <div className={styles.text} aria-busy="true">
            <Title id={titleId} className="visually-hidden">
              {t.appName}
            </Title>
            <p role="status" className="visually-hidden">
              {t.common.loading}
            </p>
            <Skeleton width="10rem" />
            <Skeleton shape="rect" width="min(28rem, 90%)" height="4.5rem" />
            <Skeleton width="16rem" />
            <Skeleton lines={3} width="min(32rem, 100%)" />
            <Skeleton shape="rect" width="12rem" height="3.25rem" />
          </div>
        )}

        {state.status === 'error' && (
          <div className={styles.text}>
            <Title id={titleId} className="visually-hidden">
              {t.appName}
            </Title>
            <EmptyState
              icon="warning"
              tone="error"
              title={t.home.featuredError}
              action={
                <Button variant="secondary" onClick={onRetry}>
                  {t.common.retry}
                </Button>
              }
            />
          </div>
        )}

        {state.status === 'ready' && state.data === null && (
          <div className={styles.text}>
            <Title id={titleId} className={styles.title}>
              {t.home.noFeaturedTitle}
            </Title>
            <p className={styles.synopsis}>{t.home.noFeaturedBody}</p>
          </div>
        )}

        {state.status === 'ready' && state.data !== null && (
          <FeaturedMovieContent movie={state.data} titleId={titleId} Title={Title} />
        )}
      </Container>
    </section>
  );
}

function FeaturedMovieContent({
  movie,
  titleId,
  Title,
}: {
  movie: FeaturedMovie;
  titleId: string;
  Title: 'h1' | 'h2';
}) {
  const t = useMessages();
  const { locale } = useLocale();
  const title = pickText(locale, movie.titleSq, movie.titleEn);
  const meta = [
    t.movie.duration(movie.durationMinutes),
    ...movie.genres.map((g) => t.movie.genres[g]),
  ];

  return (
    <>
      <div className={styles.text}>
        <p className={styles.overline}>{t.home.featured}</p>
        <Title id={titleId} className={styles.title}>
          {title}
        </Title>
        <div className={styles.meta}>
          <AgeBadge rating={movie.ageRating} />
          <span>{meta.join(' · ')}</span>
        </div>
        {(movie.formats.length > 0 || movie.languageVersions.length > 0) && (
          <div className={styles.badges}>
            {movie.formats.map((format) => (
              <FormatBadge key={format} format={format} />
            ))}
            {movie.languageVersions.map((version) => (
              <LanguageBadge key={version} version={version} />
            ))}
          </div>
        )}
        <p className={styles.synopsis}>{pickText(locale, movie.synopsisSq, movie.synopsisEn)}</p>
        <div className={styles.actions}>
          <ButtonLink to={`/movies/${movie.slug}`} size="lg" icon="ticket">
            {t.nav.buyTicket}
          </ButtonLink>
          {movie.trailerYoutubeId && (
            <TrailerButton youtubeId={movie.trailerYoutubeId} title={title} />
          )}
        </div>
      </div>

      {movie.posterPath && (
        <div className={styles.posterFrame}>
          <img
            className={styles.poster}
            src={movie.posterPath}
            alt={t.movie.poster(title)}
            width={600}
            height={900}
            fetchPriority="high"
            decoding="async"
          />
        </div>
      )}
    </>
  );
}
