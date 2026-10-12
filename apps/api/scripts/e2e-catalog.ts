// Fills the TEST database (DATABASE_URL_TEST, name must end in "_test") with the demo catalog for
// the Playwright e2e run: hall types, the 4 locations with their halls, the 12 movies and 14 days of
// showtimes from the same deterministic plan as the dev seed. No seats, users or prices (e2e
// creates its own users). Wipes the test database first. Never touches DATABASE_URL.
import { loadDotEnv, rootEnvPath } from '../src/config/load-dotenv.js';
import { assertTestDatabaseUrl } from '../src/db/database-url.js';
import { createPrismaClient } from '../src/db/prisma.js';
import { addDays, toLocalDateTime, zonedTimeToUtc } from '../src/domain/time-zone.js';
import { HALL_TYPES, LOCATIONS, MOVIES, TIME_ZONE } from '../prisma/seed/data.js';
import { planShowtimes } from '../prisma/seed/schedule.js';

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
      halls.push({
        id: savedHall.id,
        key: `${location.slug}/${hall.name}`,
        type: hall.type,
        index,
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
