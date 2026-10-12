import { Link } from 'react-router';
import { useMessages } from '../../i18n/use-messages';
import { AgeBadge, FormatBadge, LanguageBadge } from '../Badge/Badge';
import type { AgeRating, LanguageVersion, MovieFormat } from '../Badge/movie-labels';
import { Icon } from '../Icon/Icon';
import { Logo } from '../Logo/Logo';
import styles from './MovieCard.module.css';

export interface MovieCardProps {
  title: string;
  /** Movie page. The whole card is clickable through the title link. */
  to: string;
  posterSrc?: string;
  ageRating: AgeRating;
  formats?: readonly MovieFormat[];
  languageVersion?: LanguageVersion;
  durationMinutes?: number;
  genres?: readonly string[];
  /** Already formatted release line for coming-soon movies, e.g. "In cinemas from 6 November". */
  releaseLabel?: string;
  headingLevel?: 'h2' | 'h3' | 'h4';
}

export function MovieCard({
  title,
  to,
  posterSrc,
  ageRating,
  formats = [],
  languageVersion,
  durationMinutes,
  genres = [],
  releaseLabel,
  headingLevel: Heading = 'h3',
}: MovieCardProps) {
  const t = useMessages();
  const meta = [...genres, durationMinutes ? t.movie.duration(durationMinutes) : undefined]
    .filter(Boolean)
    .join(' · ');

  return (
    <article className={styles.card}>
      <div className={styles.posterFrame}>
        {posterSrc ? (
          // The title is right below, so the poster is decorative for screen readers.
          <img
            className={styles.poster}
            src={posterSrc}
            alt=""
            width={600}
            height={900}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className={styles.placeholder} aria-hidden="true">
            <Logo variant="monogram" className={styles.placeholderLogo} />
          </div>
        )}
        <AgeBadge rating={ageRating} className={styles.age} />
      </div>
      <div className={styles.body}>
        <Heading className={styles.title}>
          <Link to={to} className={styles.link}>
            {title}
          </Link>
        </Heading>
        {releaseLabel && (
          <p className={styles.release}>
            <Icon name="calendar" size={16} />
            {releaseLabel}
          </p>
        )}
        {meta && <p className={styles.meta}>{meta}</p>}
        {(formats.length > 0 || languageVersion) && (
          <div className={styles.badges}>
            {formats.map((format) => (
              <FormatBadge key={format} format={format} />
            ))}
            {languageVersion && <LanguageBadge version={languageVersion} />}
          </div>
        )}
      </div>
    </article>
  );
}
