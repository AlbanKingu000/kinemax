import { describe, expect, it } from 'vitest';
import {
  adjustmentInputSchema,
  adminUserUpdateSchema,
  adminUsersQuerySchema,
  auditQuerySchema,
  discountInputSchema,
  menuItemInputSchema,
  movieInputSchema,
  movieUpdateSchema,
  normalizeTicketCode,
  showtimeUpdateSchema,
  statsQuerySchema,
} from './admin.js';

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

const uuid = (n: number) => `0190f0a0-0000-7000-8000-${String(n).padStart(12, '0')}`;

describe('price rule inputs', () => {
  it('caps percentages at 100 and needs a real time window', () => {
    const discount = { ticketCategoryId: uuid(1), kind: 'PERCENT', value: 20 };
    expect(discountInputSchema.safeParse(discount).success).toBe(true);
    expect(discountInputSchema.safeParse({ ...discount, value: 120 }).success).toBe(false);
    expect(
      discountInputSchema.safeParse({ ...discount, kind: 'FIXED_CENTS', value: 500 }).success,
    ).toBe(true);

    const adjustment = {
      locationId: null,
      nameSq: 'Matine',
      nameEn: '',
      daysOfWeek: [1, 2],
      startMinute: 600,
      endMinute: 900,
      kind: 'PERCENT',
      value: -20,
      priority: 0,
    };
    expect(adjustmentInputSchema.parse(adjustment).nameEn).toBeNull();
    for (const bad of [{ endMinute: 600 }, { value: -120 }, { daysOfWeek: [1, 1] }]) {
      expect(adjustmentInputSchema.safeParse({ ...adjustment, ...bad }).success).toBe(false);
    }
  });
});

describe('menuItemInputSchema', () => {
  const item = {
    slug: 'kokoshka',
    nameSq: 'Kokoshka',
    nameEn: '',
    descriptionSq: null,
    descriptionEn: null,
    category: 'POPCORN',
    isActive: true,
    components: [],
  };
  it('lets only combos list contents, each once', () => {
    expect(menuItemInputSchema.parse(item).nameEn).toBeNull();
    const part = { componentId: uuid(2), quantity: 1 };
    expect(menuItemInputSchema.safeParse({ ...item, components: [part] }).success).toBe(false);
    expect(menuItemInputSchema.safeParse({ ...item, category: 'COMBO' }).success).toBe(false);
    expect(
      menuItemInputSchema.safeParse({ ...item, category: 'COMBO', components: [part] }).success,
    ).toBe(true);
    expect(
      menuItemInputSchema.safeParse({ ...item, category: 'COMBO', components: [part, part] })
        .success,
    ).toBe(false);
  });
});

describe('check-in, users and audit inputs', () => {
  it('reads a ticket code from the QR text or a typed code', () => {
    expect(normalizeTicketCode(' kinemax:abcd-1234 efgh 5678 ')).toBe('ABCD1234EFGH5678');
  });

  it('needs at least one change, and pages from 1', () => {
    expect(showtimeUpdateSchema.safeParse({}).success).toBe(false);
    expect(adminUserUpdateSchema.safeParse({}).success).toBe(false);
    expect(adminUserUpdateSchema.safeParse({ isActive: false }).success).toBe(true);
    expect(adminUserUpdateSchema.safeParse({ role: 'ROOT' }).success).toBe(false);
    expect(adminUsersQuerySchema.parse({}).page).toBe(1);
    expect(adminUsersQuerySchema.parse({ page: '3' }).page).toBe(3);
    expect(auditQuerySchema.safeParse({ from: '16.10.2026' }).success).toBe(false);
  });
});
