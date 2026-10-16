import { describe, expect, it } from 'vitest';
import { movieInputSchema, movieUpdateSchema, statsQuerySchema } from './admin.js';

const movie = {
  slug: 'drita-e-veriut',
  titleSq: ' Drita e Veriut ',
  titleEn: '',
  synopsisSq: 'Një udhëtim.',
  synopsisEn: null,
  durationMinutes: 118,
  ageRating: 'AGE_12',
  genres: ['DRAMA'],
  releaseDate: '2026-11-20',
  director: 'Regjisore',
  cast: [],
  status: 'COMING_SOON',
  trailerYoutubeId: 'dQw4w9WgXcQ',
};

describe('movieInputSchema', () => {
  it('trims texts and turns an empty English text into null', () => {
    const parsed = movieInputSchema.parse(movie);
    expect(parsed.titleSq).toBe('Drita e Veriut');
    expect(parsed.titleEn).toBeNull();
    expect(parsed.synopsisEn).toBeNull();
    expect(movieInputSchema.parse({ ...movie, titleEn: ' North ' }).titleEn).toBe('North');
  });

  it('rejects bad trailer ids, duplicate genres, unknown keys and impossible values', () => {
    for (const bad of [
      { trailerYoutubeId: 'dQw4w9WgXc' },
      { trailerYoutubeId: 'dQw4w9WgXc<' },
      { genres: ['DRAMA', 'DRAMA'] },
      { genres: ['DRAMA', 'WAR', 'MUSIC', 'HORROR', 'FAMILY', 'CRIME'] },
      { durationMinutes: 601 },
      { durationMinutes: 1.5 },
      { posterPath: '/x.svg' },
    ]) {
      expect(movieInputSchema.safeParse({ ...movie, ...bad }).success, JSON.stringify(bad)).toBe(
        false,
      );
    }
  });
});

describe('movieUpdateSchema and statsQuerySchema', () => {
  it('needs at least one field to update', () => {
    expect(movieUpdateSchema.safeParse({}).success).toBe(false);
    expect(movieUpdateSchema.parse({ status: 'ARCHIVED' })).toEqual({ status: 'ARCHIVED' });
  });

  it('defaults the dashboard range to today', () => {
    expect(statsQuerySchema.parse({})).toEqual({ range: 'today' });
    expect(statsQuerySchema.safeParse({ range: 'year' }).success).toBe(false);
  });
});
