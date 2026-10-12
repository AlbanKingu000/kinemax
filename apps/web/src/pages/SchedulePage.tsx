import type { LanguageVersion, ShowtimesResponse } from '@kinemax/shared';
import { useId, useState } from 'react';
import { Link as RouterLink } from 'react-router';
import { fetchShowtimes } from '../api/catalog';
import { AgeBadge } from '../components/Badge/Badge';
import { Button } from '../components/Button/Button';
import { ChooseCinema } from '../components/ChooseCinema/ChooseCinema';
import { Chip } from '../components/Chip/Chip';
import { DayTabs } from '../components/DayTabs/DayTabs';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { Container } from '../components/Layout/Layout';
import { Modal } from '../components/Modal/Modal';
import { ShowtimeGroups } from '../components/ShowtimeGroups/ShowtimeGroups';
import { Skeleton } from '../components/Skeleton/Skeleton';
import { useAsync } from '../hooks/use-async';
import { usePageMeta } from '../hooks/use-page-meta';
import { FORMATS, LANGUAGES, useScheduleParams } from '../hooks/use-schedule-params';
import { scheduleDays } from '../i18n/format';
import { pickText } from '../i18n/messages';
import { useLocale, useMessages } from '../i18n/use-messages';
import { useLocationChoice } from '../location/location-context';
import styles from './SchedulePage.module.css';

/** All showtimes of the chosen cinema for one day, filterable, grouped by movie. */
export function SchedulePage() {
  const t = useMessages();
  usePageMeta(`${t.schedule.title} · ${t.meta.titleSuffix}`, t.schedule.description);
  const { selected, ready } = useLocationChoice();
  const days = selected ? scheduleDays(selected.timeZone) : [];
  const { date, filters, hasFilters, setDate, toggle, setFilters, clearFilters } =
    useScheduleParams(days);
  const hallTypes = selected?.hallTypes ?? [];
  const filterKey = `${filters.hallType.join(',')}|${filters.format.join(',')}|${filters.language.join(',')}`;
  const showtimes = useAsync(
    (signal) =>
      fetchShowtimes(
        {
          location: selected?.slug ?? '',
          date: date ?? '',
          hallType: filters.hallType,
          format: filters.format,
          language: filters.language,
        },
        signal,
      ),
    `schedule:${selected?.slug ?? ''}:${date ?? ''}:${filterKey}`,
    selected !== null && date !== undefined,
  );

  const [sheetOpen, setSheetOpen] = useState(false);
  const activeCount = filters.hallType.length + filters.format.length + filters.language.length;

  return (
    <Container className={styles.page}>
      <header className={styles.heading}>
        <h1 className={styles.title}>{t.schedule.title}</h1>
        {selected && <p className={styles.subtitle}>{t.schedule.at(selected.name)}</p>}
      </header>

      {!ready && <Skeleton shape="rect" height="10rem" />}
      {ready && (!selected || date === undefined) && <ChooseCinema />}
      {ready && selected && date !== undefined && (
        <DayTabs days={days} selected={date} onSelect={setDate}>
          {/* Wide screens: the filters inline. Phones: one button opening a bottom sheet. */}
          <div className={styles.inlineFilters}>
            <FilterControls
              hallTypes={hallTypes}
              filters={filters}
              onToggle={toggle}
              onClear={hasFilters ? clearFilters : undefined}
            />
          </div>
          <div className={styles.sheetButton}>
            <Button
              variant="secondary"
              icon="plus"
              aria-haspopup="dialog"
              onClick={() => {
                setSheetOpen(true);
              }}
            >
              {t.schedule.openFilters(activeCount)}
            </Button>
          </div>
          <FilterSheet
            open={sheetOpen}
            onClose={() => {
              setSheetOpen(false);
            }}
            hallTypes={hallTypes}
            filters={filters}
            onApply={(next) => {
              setFilters(next);
              setSheetOpen(false);
            }}
          />
          <div className={styles.results}>
            {showtimes.status === 'loading' && (
              <div aria-busy="true" className={styles.list}>
                <p role="status" className="visually-hidden">
                  {t.showtimes.loading}
                </p>
                {[1, 2].map((n) => (
                  <Skeleton key={n} shape="rect" height="12rem" />
                ))}
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
            {showtimes.status === 'ready' && showtimes.data.movies.length === 0 && (
              <EmptyState
                icon="calendar"
                title={hasFilters ? t.schedule.noMatchTitle : t.showtimes.noneForDay}
                action={
                  hasFilters ? (
                    <Button variant="secondary" icon="close" onClick={clearFilters}>
                      {t.schedule.clearFilters}
                    </Button>
                  ) : undefined
                }
              >
                <p>{hasFilters ? t.schedule.noMatchBody : t.showtimes.noneForDayBody}</p>
              </EmptyState>
            )}
            {showtimes.status === 'ready' && showtimes.data.movies.length > 0 && (
              <ul className={styles.list}>
                {showtimes.data.movies.map((entry) => (
                  <li key={entry.movie.slug}>
                    <ScheduleMovie entry={entry} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DayTabs>
      )}
    </Container>
  );
}

type Filters = { hallType: string[]; format: string[]; language: string[] };
type FilterKey = keyof Filters;

/** The three chip rows (hall type, format, language), multi-select within each row. */
function FilterControls({
  hallTypes,
  filters,
  onToggle,
  onClear,
}: {
  hallTypes: readonly { code: string; nameSq: string; nameEn: string | null }[];
  filters: Filters;
  onToggle: (key: FilterKey, value: string, order: readonly string[]) => void;
  onClear?: (() => void) | undefined;
}) {
  const t = useMessages();
  const { locale } = useLocale();
  return (
    <div className={styles.filters} role="group" aria-label={t.schedule.filters}>
      <FilterRow label={t.schedule.hallType}>
        {hallTypes.map((type) => (
          <Chip
            key={type.code}
            label={pickText(locale, type.nameSq, type.nameEn)}
            selected={filters.hallType.includes(type.code)}
            onToggle={() => {
              onToggle(
                'hallType',
                type.code,
                hallTypes.map((h) => h.code),
              );
            }}
          />
        ))}
      </FilterRow>
      <FilterRow label={t.schedule.format}>
        {FORMATS.map((format) => (
          <Chip
            key={format}
            label={format}
            selected={filters.format.includes(format)}
            onToggle={() => {
              onToggle('format', format, FORMATS);
            }}
          />
        ))}
      </FilterRow>
      <FilterRow label={t.schedule.language}>
        {LANGUAGES.map((language: LanguageVersion) => (
          <Chip
            key={language}
            label={t.movie.languageVersions[language]}
            selected={filters.language.includes(language)}
            onToggle={() => {
              onToggle('language', language, LANGUAGES);
            }}
          />
        ))}
      </FilterRow>
      {onClear && (
        <Button variant="ghost" size="sm" icon="close" onClick={onClear}>
          {t.schedule.clearFilters}
        </Button>
      )}
    </div>
  );
}

/** Phones: the filters in a bottom sheet; changes apply only with "Apliko". */
function FilterSheet({
  open,
  onClose,
  hallTypes,
  filters,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  hallTypes: readonly { code: string; nameSq: string; nameEn: string | null }[];
  filters: Filters;
  onApply: (next: Filters) => void;
}) {
  const t = useMessages();
  const [pending, setPending] = useState<Filters>(filters);
  const [openedWith, setOpenedWith] = useState<Filters | null>(null);
  // Every time the sheet opens it starts from the filters in the URL.
  if (open && openedWith === null) {
    setOpenedWith(filters);
    setPending(filters);
  } else if (!open && openedWith !== null) {
    setOpenedWith(null);
  }
  const toggle = (key: FilterKey, value: string, order: readonly string[]) => {
    setPending((current) => {
      const has = current[key].includes(value);
      const wanted = has ? current[key].filter((v) => v !== value) : [...current[key], value];
      return { ...current, [key]: order.filter((v) => wanted.includes(v)) };
    });
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t.schedule.filters}
      variant="sheet"
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              setPending({ hallType: [], format: [], language: [] });
            }}
          >
            {t.schedule.clear}
          </Button>
          <Button
            onClick={() => {
              onApply(pending);
            }}
          >
            {t.schedule.apply}
          </Button>
        </>
      }
    >
      <FilterControls hallTypes={hallTypes} filters={pending} onToggle={toggle} />
    </Modal>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <div className={styles.filterRow} role="group" aria-labelledby={id}>
      <span id={id} className={styles.filterLabel}>
        {label}
      </span>
      <div className={styles.chips}>{children}</div>
    </div>
  );
}

function ScheduleMovie({ entry }: { entry: ShowtimesResponse['movies'][number] }) {
  const t = useMessages();
  const { locale } = useLocale();
  const { movie, groups } = entry;
  const title = pickText(locale, movie.titleSq, movie.titleEn);
  const meta = [
    t.movie.duration(movie.durationMinutes),
    ...movie.genres.map((g) => t.movie.genres[g]),
  ];
  return (
    <article className={styles.movie}>
      <RouterLink
        to={`/movies/${movie.slug}`}
        className={styles.posterLink}
        tabIndex={-1}
        aria-hidden="true"
      >
        {movie.posterPath && (
          <img
            className={styles.poster}
            src={movie.posterPath}
            alt=""
            width={600}
            height={900}
            loading="lazy"
            decoding="async"
          />
        )}
      </RouterLink>
      <div className={styles.movieBody}>
        <div className={styles.movieHeading}>
          <h2 className={styles.movieTitle}>
            <RouterLink to={`/movies/${movie.slug}`} className={styles.movieLink}>
              {title}
            </RouterLink>
          </h2>
          <div className={styles.meta}>
            <AgeBadge rating={movie.ageRating} />
            <span>{meta.join(' · ')}</span>
          </div>
        </div>
        <ShowtimeGroups groups={groups} />
      </div>
    </article>
  );
}
