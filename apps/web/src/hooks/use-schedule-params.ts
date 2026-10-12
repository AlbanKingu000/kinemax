import {
  hallTypeCodeSchema,
  languageVersionSchema,
  movieFormatSchema,
  type LanguageVersion,
  type MovieFormat,
} from '@kinemax/shared';
import { useCallback } from 'react';
import { useSearchParams } from 'react-router';

export const FORMATS: readonly MovieFormat[] = movieFormatSchema.options;
export const LANGUAGES: readonly LanguageVersion[] = languageVersionSchema.options;
type FilterKey = 'hallType' | 'format' | 'language';

/** Valid values of a comma-separated query parameter, in a stable order. */
function readList(raw: string | null, isValid: (value: string) => boolean): string[] {
  return [...new Set((raw ?? '').split(',').filter((value) => value !== '' && isValid(value)))];
}

/**
 * The schedule view in the URL query (?date=…&hallType=…&format=…&language=…), so any view can be
 * shared and survives reload and back/forward. Invalid or outdated values are ignored: a date that
 * is not one of `days` falls back to the first day (today).
 */
export function useScheduleParams(days: readonly string[]) {
  const [params, setParams] = useSearchParams();
  const raw = params.get('date');
  const date = raw !== null && days.includes(raw) ? raw : days[0];
  const filters = {
    hallType: readList(params.get('hallType'), (v) => hallTypeCodeSchema.safeParse(v).success),
    format: readList(params.get('format'), (v) => (FORMATS as readonly string[]).includes(v)),
    language: readList(params.get('language'), (v) => (LANGUAGES as readonly string[]).includes(v)),
  };

  const update = useCallback(
    (change: (next: URLSearchParams) => void) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          change(next);
          return next;
        },
        { preventScrollReset: true },
      );
    },
    [setParams],
  );

  const setDate = useCallback(
    (day: string) => {
      update((next) => {
        next.set('date', day);
      });
    },
    [update],
  );

  const toggle = useCallback(
    (key: FilterKey, value: string, order: readonly string[]) => {
      update((next) => {
        const current = readList(next.get(key), () => true);
        const wanted = current.includes(value)
          ? current.filter((v) => v !== value)
          : [...current, value];
        // Keep the order of the chips, so equal views have equal URLs.
        const sorted = order.filter((v) => wanted.includes(v));
        if (sorted.length > 0) next.set(key, sorted.join(','));
        else next.delete(key);
      });
    },
    [update],
  );

  /** Replaces all three filters at once (the mobile sheet's "Apliko"). */
  const setFilters = useCallback(
    (next: {
      hallType: readonly string[];
      format: readonly string[];
      language: readonly string[];
    }) => {
      update((params) => {
        for (const key of ['hallType', 'format', 'language'] as const) {
          if (next[key].length > 0) params.set(key, next[key].join(','));
          else params.delete(key);
        }
      });
    },
    [update],
  );

  const clearFilters = useCallback(() => {
    update((next) => {
      for (const key of ['hallType', 'format', 'language']) next.delete(key);
    });
  }, [update]);

  const hasFilters =
    filters.hallType.length > 0 || filters.format.length > 0 || filters.language.length > 0;
  return { date, filters, hasFilters, setDate, toggle, setFilters, clearFilters };
}
