// Fills the TEST database (DATABASE_URL_TEST, name must end in "_test") with the demo catalog for
// the Playwright e2e run: hall types, the 4 locations with their halls and seats, the 12 movies,
// prices, the per-location menus and 14 days of showtimes from the same deterministic plan as the dev seed, plus the fixed
// test customers and staff (e2e-account.ts). No bookings, so every show is available. Wipes the test database first. Never touches DATABASE_URL.
import { hashPassword } from '../src/auth/password.js';
import { loadDotEnv, rootEnvPath } from '../src/config/load-dotenv.js';
import { assertTestDatabaseUrl } from '../src/db/database-url.js';
import { createPrismaClient } from '../src/db/prisma.js';
import { generateSeats } from '../src/domain/seat-layout.js';
import { addDays, toLocalDateTime, zonedTimeToUtc } from '../src/domain/time-zone.js';
import {
  BASE_PRICES,
  HALL_TYPES,
  LOCATIONS,
  MOVIES,
  RULES_VALID_FROM,
  SEAT_SURCHARGES,
  TICKET_CATEGORIES,
  TIME_ADJUSTMENTS,
  TIME_ZONE,
} from '../prisma/seed/data.js';
import { seedMenu } from '../prisma/seed/menu.js';
import { planShowtimes } from '../prisma/seed/schedule.js';
import { E2E_ACCOUNTS, E2E_STAFF } from './e2e-account.js';

const SCHEDULE_DAYS = 14;

loadDotEnv(rootEnvPath);
const prisma = createPrismaClient(assertTestDatabaseUrl(process.env.DATABASE_URL_TEST));

try {
  await prisma.$executeRaw`TRUNCATE "DemoPayment", "BookingFoodItem", "SeatReservation",
    "WholeHallReservation", "BookingSeat", "Booking", "Session", "ManagerLocation", "AuditLog",
    "Showtime", "Seat", "HallTypePrice", "WholeHallPrice", "TimePriceAdjustment",
    "TicketCategoryDiscount", "TicketCategory", "SeatTypeSurcharge", "LocationMenuItem",
    "ComboComponent", "MenuItem", "Hall", "HallType", "Location", "Movie", "AppSettings",
    "User"`;
  await prisma.appSettings.create({ data: { id: 1 } });

  // The fixed customers the e2e specs sign in with, one per Playwright project (e2e-account.ts).
  for (const account of Object.values(E2E_ACCOUNTS)) {
    await prisma.user.create({
      data: {
        email: account.email,
        name: account.name,
        passwordHash: await hashPassword(account.password),
      },
    });
  }

  const hallTypeIds = new Map<string, string>();
  for (const type of HALL_TYPES) {
    hallTypeIds.set(type.code, (await prisma.hallType.create({ data: type })).id);
  }

  const halls: {
    id: string;
    key: string;
    type: (typeof HALL_TYPES)[number]['code'];
    index: number;
  }[] = [];
  for (const location of LOCATIONS) {
    const saved = await prisma.location.create({
      data: {
        slug: location.slug,
        name: location.name,
        city: location.city,
        address: location.address,
        timeZone: TIME_ZONE,
      },
    });
    for (const [index, hall] of location.halls.entries()) {
      const savedHall = await prisma.hall.create({
        data: {
          locationId: saved.id,
          hallTypeId: hallTypeIds.get(hall.type) ?? '',
          name: hall.name,
          wholeHallOnly: hall.type === 'PRIVATE_SUITE',
          screenWidthM: hall.screen.widthM,
          screenHeightM: hall.screen.heightM,
          screenZ: hall.screen.z,
        },
      });
      await prisma.seat.createMany({
        data: generateSeats(hall.layout).map((seat) => ({ ...seat, hallId: savedHall.id })),
      });
      if (hall.wholeHallPriceCents !== undefined) {
        await prisma.wholeHallPrice.create({
          data: {
            hallId: savedHall.id,
            priceCents: hall.wholeHallPriceCents,
            validFrom: RULES_VALID_FROM,
          },
        });
      }
      halls.push({
        id: savedHall.id,
        key: `${location.slug}/${hall.name}`,
        type: hall.type,
        index,
      });
    }
  }

  const locationIds = new Map(
    (await prisma.location.findMany({ select: { id: true, slug: true } })).map((l) => [
      l.slug,
      l.id,
    ]),
  );
  // The staff the admin specs sign in with (e2e-account.ts).
  for (const staff of Object.values(E2E_STAFF)) {
    const saved = await prisma.user.create({
      data: {
        email: staff.email,
        name: staff.name,
        role: staff.role,
        passwordHash: await hashPassword(staff.password),
      },
    });
    if ('locationSlug' in staff) {
      await prisma.managerLocation.create({
        data: { userId: saved.id, locationId: locationIds.get(staff.locationSlug) ?? '' },
      });
    }
  }
  await seedMenu(prisma, locationIds);
  await prisma.hallTypePrice.createMany({
    data: BASE_PRICES.map((rule) => ({
      hallTypeId: hallTypeIds.get(rule.hallType) ?? '',
      locationId: rule.locationSlug ? (locationIds.get(rule.locationSlug) ?? null) : null,
      priceCents: rule.priceCents,
      validFrom: RULES_VALID_FROM,
    })),
  });
  await prisma.seatTypeSurcharge.createMany({
    data: SEAT_SURCHARGES.map((rule) => ({ ...rule, validFrom: RULES_VALID_FROM })),
  });
  await prisma.timePriceAdjustment.createMany({
    data: TIME_ADJUSTMENTS.map((rule) => ({
      nameSq: rule.nameSq,
      nameEn: rule.nameEn,
      daysOfWeek: rule.daysOfWeek,
      startMinute: rule.startMinute,
      endMinute: rule.endMinute,
      kind: rule.kind,
      value: rule.value,
      priority: rule.priority,
      validFrom: RULES_VALID_FROM,
    })),
  });
  for (const { discount, ...category } of TICKET_CATEGORIES) {
    const saved = await prisma.ticketCategory.create({ data: category });
    if (discount) {
      await prisma.ticketCategoryDiscount.create({
        data: { ticketCategoryId: saved.id, ...discount, validFrom: RULES_VALID_FROM },
      });
    }
  }

  const movieIds = new Map<string, string>();
  for (const movie of MOVIES) {
    const saved = await prisma.movie.create({
      data: {
        ...movie,
        releaseDate: new Date(`${movie.releaseDate}T00:00:00Z`),
        posterPath: `/seed/posters/${movie.slug}.svg`,
        backdropPath: `/seed/backdrops/${movie.slug}.svg`,
      },
    });
    movieIds.set(movie.slug, saved.id);
  }

  const today = toLocalDateTime(new Date(), TIME_ZONE).date;
  const plan = planShowtimes({
    halls,
    movies: MOVIES.filter((movie) => movie.status === 'NOW_SHOWING'),
    dates: Array.from({ length: SCHEDULE_DAYS }, (_, i) => addDays(today, i)),
  });
  const hallIds = new Map(halls.map((hall) => [hall.key, hall.id]));
  await prisma.showtime.createMany({
    data: plan.map((p) => {
      const startsAt = zonedTimeToUtc(p.date, p.startMinute, TIME_ZONE);
      return {
        hallId: hallIds.get(p.hallKey) ?? '',
        movieId: movieIds.get(p.movieSlug) ?? '',
        startsAt,
        endsAt: new Date(startsAt.getTime() + p.blockMinutes * 60_000),
        format: p.format,
        languageVersion: p.languageVersion,
      };
    }),
  });
  console.info(
    `e2e catalog: ${String(LOCATIONS.length)} locations, ${String(MOVIES.length)} movies, ${String(plan.length)} showtimes.`,
  );
} finally {
  await prisma.$disconnect();
}
