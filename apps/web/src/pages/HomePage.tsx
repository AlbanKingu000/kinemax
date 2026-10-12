import { fetchFeatured, fetchMovies } from '../api/catalog';
import { Button } from '../components/Button/Button';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { FeaturedHero } from '../components/FeaturedHero/FeaturedHero';
import { MovieRail } from '../components/MovieRail/MovieRail';
import { useAsync } from '../hooks/use-async';
import { usePageMeta } from '../hooks/use-page-meta';
import { useMessages } from '../i18n/use-messages';
import { useLocationChoice } from '../location/location-context';

export function HomePage() {
  const t = useMessages();
  const { selected, ready, openPicker } = useLocationChoice();
  usePageMeta(t.meta.homeTitle, t.meta.homeDescription);

  // Location-dependent data waits until the saved choice is checked (an unknown slug would 404).
  const slug = selected?.slug;
  const featured = useAsync(
    (signal) => fetchFeatured(slug, signal),
    `featured:${slug ?? ''}`,
    ready,
  );
  const nowShowing = useAsync(
    (signal) => fetchMovies('NOW_SHOWING', slug, signal),
    `now:${slug ?? ''}`,
    ready,
  );
  // Releases are chain-wide.
  const comingSoon = useAsync((signal) => fetchMovies('COMING_SOON', undefined, signal), 'soon');

  return (
    <>
      <FeaturedHero state={featured} onRetry={featured.retry} />
      <MovieRail
        id="now-showing"
        title={t.home.nowShowing}
        subtitle={selected ? t.home.atLocation(selected.city) : t.home.allLocations}
        state={nowShowing}
        onRetry={nowShowing.retry}
        empty={
          <EmptyState
            title={t.home.noMoviesTitle}
            action={
              <Button variant="secondary" icon="mapPin" onClick={openPicker}>
                {t.home.changeLocation}
              </Button>
            }
          >
            <p>{t.home.noMoviesBody}</p>
          </EmptyState>
        }
      />
      <MovieRail
        id="coming-soon"
        title={t.home.comingSoon}
        state={comingSoon}
        onRetry={comingSoon.retry}
        showRelease
        empty={<EmptyState title={t.home.noComingSoon} icon="calendar" />}
      />
    </>
  );
}
