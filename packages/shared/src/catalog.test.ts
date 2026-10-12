import { describe, expect, it } from 'vitest';
import { featuredResponseSchema, moviesQuerySchema, slugSchema } from './index.js';

describe('catalog query schemas', () => {
  it('accepts a status with an optional location slug', () => {
    expect(moviesQuerySchema.parse({ status: 'NOW_SHOWING' })).toEqual({ status: 'NOW_SHOWING' });
    expect(moviesQuerySchema.parse({ status: 'COMING_SOON', location: 'prizren' })).toEqual({
      status: 'COMING_SOON',
      location: 'prizren',
    });
  });

  it('rejects unknown statuses, unknown keys, repeated values and malformed slugs', () => {
    expect(moviesQuerySchema.safeParse({}).success).toBe(false);
    expect(moviesQuerySchema.safeParse({ status: 'ARCHIVED' }).success).toBe(false);
    expect(moviesQuerySchema.safeParse({ status: 'NOW_SHOWING', id: '1' }).success).toBe(false);
    expect(moviesQuerySchema.safeParse({ status: ['NOW_SHOWING', 'COMING_SOON'] }).success).toBe(
      false,
    );
    for (const slug of ['Prizren', 'pri zren', '-x', 'x-', "x'--", '', 'a'.repeat(81)]) {
      expect(slugSchema.safeParse(slug).success, slug).toBe(false);
    }
  });
});

describe('featuredResponseSchema', () => {
  it('accepts no featured movie and rejects a malformed trailer id', () => {
    expect(featuredResponseSchema.parse({ movie: null })).toEqual({ movie: null });
    const movie = {
      slug: 'a',
      titleSq: 'A',
      titleEn: null,
      synopsisSq: 'S',
      synopsisEn: null,
      ageRating: 'ALL',
      durationMinutes: 90,
      genres: ['DRAMA'],
      releaseDate: '2026-10-01',
      posterPath: null,
      backdropPath: null,
      formats: ['2D'],
      languageVersions: ['DUBBED_SQ'],
      trailerYoutubeId: 'abc"><script',
    };
    expect(featuredResponseSchema.safeParse({ movie }).success).toBe(false);
    expect(
      featuredResponseSchema.safeParse({ movie: { ...movie, trailerYoutubeId: 'dQw4w9WgXcQ' } })
        .success,
    ).toBe(true);
  });
});
