import { describe, expect, it } from 'vitest';
import {
  HALL_TYPES,
  LOCATION_MENUS,
  LOCATIONS,
  MENU_ITEMS,
  MOVIES,
  SEED_USERS,
  TIME_ADJUSTMENTS,
} from '../../prisma/seed/data.js';
import { readFileSync } from 'node:fs';
import { MENU_ART_SLUGS, menuArtSvg } from '../../prisma/seed/menu-art.js';
import { menuImagePath } from '../../prisma/seed/menu.js';
import { backdropSvg, posterSvg } from '../../prisma/seed/posters.js';
import {
  CLEANING_BUFFER_MINUTES,
  planShowtimes,
  type ScheduleHall,
} from '../../prisma/seed/schedule.js';
import { addDays } from '../../src/domain/time-zone.js';

describe('seed data', () => {
  it('has 4 locations; Prishtinë has 6 halls covering all 4 hall types', () => {
    expect(LOCATIONS).toHaveLength(4);
    const prishtine = LOCATIONS.find((l) => l.slug === 'prishtine');
    expect(prishtine?.halls).toHaveLength(6);
    expect(new Set(prishtine?.halls.map((h) => h.type))).toEqual(
      new Set(HALL_TYPES.map((t) => t.code)),
    );
    for (const location of LOCATIONS.filter((l) => l.slug !== 'prishtine')) {
      expect(location.halls.length).toBeGreaterThanOrEqual(3);
      expect(location.halls.length).toBeLessThanOrEqual(4);
      const types = new Set(location.halls.map((h) => h.type)).size;
      expect(types).toBeGreaterThanOrEqual(2);
      expect(types).toBeLessThanOrEqual(3);
    }
  });

  it('gives every suite a whole-hall price and seat delivery only to VIP/suite types', () => {
    for (const hall of LOCATIONS.flatMap((l) => l.halls)) {
      expect(hall.wholeHallPriceCents !== undefined).toBe(hall.type === 'PRIVATE_SUITE');
    }
    const delivery = HALL_TYPES.filter((t) => t.allowsSeatDelivery)
      .map((t) => t.code)
      .sort();
    expect(delivery).toEqual(['PRIVATE_SUITE', 'VIP_RECLINER']);
  });

  it('has 12 fictional movies with Albanian and English texts', () => {
    expect(MOVIES).toHaveLength(12);
    expect(new Set(MOVIES.map((m) => m.slug)).size).toBe(12);
    expect(MOVIES.some((m) => m.status === 'NOW_SHOWING')).toBe(true);
    expect(MOVIES.some((m) => m.status === 'COMING_SOON')).toBe(true);
    for (const movie of MOVIES) {
      expect(movie.titleSq && movie.titleEn && movie.synopsisSq && movie.synopsisEn).toBeTruthy();
      expect(movie.slug).toMatch(/^[a-z0-9-]+$/);
    }
    expect(new Set(MOVIES.map((m) => m.ageRating)).size).toBe(5);
  });

  it('has a consistent menu with combos built from existing items', () => {
    const slugs = new Set(MENU_ITEMS.map((i) => i.slug));
    expect(slugs.size).toBe(MENU_ITEMS.length);
    const combos = MENU_ITEMS.filter((i) => i.category === 'COMBO');
    expect(combos.length).toBeGreaterThanOrEqual(3);
    for (const combo of combos) {
      expect(combo.components?.length).toBeGreaterThan(0);
      for (const c of combo.components ?? []) expect(slugs.has(c.slug)).toBe(true);
    }
    for (const menu of Object.values(LOCATION_MENUS)) {
      for (const slug of menu.unavailable) expect(slugs.has(slug)).toBe(true);
    }
    expect(Object.keys(LOCATION_MENUS).sort()).toEqual(LOCATIONS.map((l) => l.slug).sort());
  });

  it('has an illustration for every menu item, committed as the generator draws it', () => {
    expect([...MENU_ART_SLUGS].sort()).toEqual(MENU_ITEMS.map((i) => i.slug).sort());
    for (const item of MENU_ITEMS) {
      const file = new URL(`../../../web/public${menuImagePath(item.slug)}`, import.meta.url);
      expect(readFileSync(file, 'utf8')).toBe(menuArtSvg(item.slug));
    }
    expect(menuArtSvg('unknown')).toMatch(/^<\?xml[\s\S]*<\/svg>\n$/);
  });

  it('defines valid time windows and one manager per location', () => {
    for (const rule of TIME_ADJUSTMENTS) {
      expect(rule.startMinute).toBeLessThan(rule.endMinute);
      expect(rule.endMinute).toBeLessThanOrEqual(1440);
    }
    expect(SEED_USERS.managers.map((m) => m.locationSlug).sort()).toEqual(
      LOCATIONS.map((l) => l.slug).sort(),
    );
    for (const user of [SEED_USERS.superAdmin, ...SEED_USERS.managers, ...SEED_USERS.customers]) {
      expect(user.email).toBe(user.email.toLowerCase());
      expect(user.email.endsWith('@kinemax.test')).toBe(true);
    }
  });
});

describe('planShowtimes', () => {
  const halls: ScheduleHall[] = LOCATIONS.flatMap((l) =>
    l.halls.map((h, index) => ({ key: `${l.slug}/${h.name}`, type: h.type, index })),
  );
  const movies = MOVIES.filter((m) => m.status === 'NOW_SHOWING');
  const dates = Array.from({ length: 14 }, (_, i) => addDays('2026-10-19', i));
  const plan = planShowtimes({ halls, movies, dates });
  const movieBySlug = new Map(movies.map((m) => [m.slug, m]));

  it('is deterministic per date', () => {
    expect(planShowtimes({ halls, movies, dates })).toEqual(plan);
    const later = planShowtimes({ halls, movies, dates: dates.slice(3) });
    expect(later).toEqual(plan.filter((p) => dates.slice(3).includes(p.date)));
  });

  it('never overlaps within a hall and keeps the cleaning buffer', () => {
    for (const hall of halls) {
      const shows = plan
        .filter((p) => p.hallKey === hall.key)
        .map((p) => ({
          start: Date.parse(`${p.date}T00:00:00Z`) / 60_000 + p.startMinute,
          block: p.blockMinutes,
        }))
        .sort((a, b) => a.start - b.start);
      for (let i = 1; i < shows.length; i++) {
        const prev = shows[i - 1];
        const cur = shows[i];
        if (prev && cur) expect(cur.start).toBeGreaterThanOrEqual(prev.start + prev.block);
      }
    }
    for (const show of plan) {
      expect(show.blockMinutes).toBe(
        (movieBySlug.get(show.movieSlug)?.durationMinutes ?? 0) + CLEANING_BUFFER_MINUTES,
      );
    }
  });

  it('uses realistic times and suitable slots', () => {
    for (const show of plan) {
      const movie = movieBySlug.get(show.movieSlug);
      expect(show.startMinute).toBeGreaterThanOrEqual(10 * 60 + 30);
      expect(show.startMinute).toBeLessThanOrEqual(23 * 60 + 15);
      if (movie?.ageRating === 'AGE_18') expect(show.startMinute).toBeGreaterThanOrEqual(19 * 60);
      const forKids =
        movie?.genres.includes('ANIMATION') ||
        movie?.genres.includes('FAMILY') ||
        movie?.ageRating === 'ALL';
      if (forKids) expect(show.startMinute).toBeLessThanOrEqual(20 * 60);
    }
    const suites = halls.filter((h) => h.type === 'PRIVATE_SUITE');
    for (const suite of suites) {
      for (const date of dates) {
        expect(
          plan.filter((p) => p.hallKey === suite.key && p.date === date).length,
        ).toBeLessThanOrEqual(3);
      }
    }
  });

  it('varies formats and language versions', () => {
    expect(new Set(plan.map((p) => p.format))).toEqual(new Set(['FORMAT_2D', 'FORMAT_3D']));
    expect(new Set(plan.map((p) => p.languageVersion))).toEqual(
      new Set(['ORIGINAL_SQ_SUBTITLES', 'DUBBED_SQ', 'ORIGINAL_NO_SUBTITLES']),
    );
    const threeD = plan.filter((p) => p.format === 'FORMAT_3D');
    const typeOf = new Map(halls.map((h) => [h.key, h.type]));
    expect(
      threeD.every((p) =>
        ['PREMIUM_LARGE_FORMAT', 'STANDARD'].includes(typeOf.get(p.hallKey) ?? ''),
      ),
    ).toBe(true);
  });

  it('returns nothing without movies', () => {
    expect(planShowtimes({ halls, movies: [], dates })).toEqual([]);
  });
});

describe('placeholder artwork', () => {
  it('produces escaped, deterministic SVG', () => {
    const poster = posterSvg({ slug: 'a-b', titleSq: 'Tom & <Jerry> "Test"' });
    expect(poster).toContain('&amp;');
    expect(poster).toContain('&lt;JERRY&gt;');
    expect(poster).not.toContain('<JERRY>');
    expect(poster).toBe(posterSvg({ slug: 'a-b', titleSq: 'Tom & <Jerry> "Test"' }));
    expect(backdropSvg({ slug: 'a-b' })).toMatch(/^<\?xml[\s\S]*<\/svg>\n$/);
  });
});

describe('hall spacing', () => {
  it('lays out every seeded hall with the spacing rules of its hall type', async () => {
    const { HALL_TYPE_SPACING } = await import('@kinemax/shared');
    for (const location of LOCATIONS) {
      for (const hall of location.halls) {
        expect(hall.layout, `${location.slug}/${hall.name}`).toEqual({
          rows: hall.layout.rows,
          ...HALL_TYPE_SPACING[hall.type],
        });
      }
    }
  });
});
