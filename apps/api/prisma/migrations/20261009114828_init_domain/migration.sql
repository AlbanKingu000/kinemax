-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('sq', 'en');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('CUSTOMER', 'LOCATION_MANAGER', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "SeatType" AS ENUM ('STANDARD', 'VIP', 'COUPLE', 'WHEELCHAIR', 'COMPANION');

-- CreateEnum
CREATE TYPE "AgeRating" AS ENUM ('ALL', 'AGE_7', 'AGE_12', 'AGE_15', 'AGE_18');

-- CreateEnum
CREATE TYPE "Genre" AS ENUM ('ACTION', 'ADVENTURE', 'ANIMATION', 'COMEDY', 'CRIME', 'DOCUMENTARY', 'DRAMA', 'FAMILY', 'FANTASY', 'HISTORY', 'HORROR', 'MUSIC', 'MYSTERY', 'ROMANCE', 'SCI_FI', 'THRILLER', 'WAR');

-- CreateEnum
CREATE TYPE "MovieStatus" AS ENUM ('COMING_SOON', 'NOW_SHOWING', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ShowtimeFormat" AS ENUM ('2D', '3D');

-- CreateEnum
CREATE TYPE "LanguageVersion" AS ENUM ('ORIGINAL_SQ_SUBTITLES', 'DUBBED_SQ', 'ORIGINAL_NO_SUBTITLES');

-- CreateEnum
CREATE TYPE "AdjustmentKind" AS ENUM ('PERCENT', 'FIXED_CENTS');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('HELD', 'CONFIRMED', 'CANCELLED', 'EXPIRED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "MenuCategory" AS ENUM ('POPCORN', 'DRINK', 'SNACK', 'NACHOS', 'HOT_DOG', 'VIP_DISH', 'COMBO');

-- CreateEnum
CREATE TYPE "Fulfillment" AS ENUM ('PICKUP_AT_COUNTER', 'DELIVER_TO_SEAT');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED');

-- CreateTable
CREATE TABLE "Location" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HallType" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "nameSq" TEXT NOT NULL,
    "nameEn" TEXT,
    "descriptionSq" TEXT NOT NULL,
    "descriptionEn" TEXT,
    "features" TEXT[],
    "allowsSeatDelivery" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "HallType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hall" (
    "id" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "hallTypeId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "wholeHallOnly" BOOLEAN NOT NULL DEFAULT false,
    "screenWidthM" DOUBLE PRECISION NOT NULL,
    "screenHeightM" DOUBLE PRECISION NOT NULL,
    "screenX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "screenY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "screenZ" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Hall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Seat" (
    "id" UUID NOT NULL,
    "hallId" UUID NOT NULL,
    "rowLabel" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "seatType" "SeatType" NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "z" DOUBLE PRECISION NOT NULL,
    "rotationDeg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "widthUnits" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Seat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Movie" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "titleSq" TEXT NOT NULL,
    "titleEn" TEXT,
    "synopsisSq" TEXT NOT NULL,
    "synopsisEn" TEXT,
    "durationMinutes" INTEGER NOT NULL,
    "ageRating" "AgeRating" NOT NULL,
    "genres" "Genre"[],
    "releaseDate" DATE NOT NULL,
    "posterPath" TEXT,
    "backdropPath" TEXT,
    "trailerYoutubeId" TEXT,
    "director" TEXT NOT NULL,
    "cast" TEXT[],
    "status" "MovieStatus" NOT NULL DEFAULT 'COMING_SOON',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Movie_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Showtime" (
    "id" UUID NOT NULL,
    "movieId" UUID NOT NULL,
    "hallId" UUID NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "format" "ShowtimeFormat" NOT NULL DEFAULT '2D',
    "languageVersion" "LanguageVersion" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Showtime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HallTypePrice" (
    "id" UUID NOT NULL,
    "hallTypeId" UUID NOT NULL,
    "locationId" UUID,
    "priceCents" INTEGER NOT NULL,
    "validFrom" TIMESTAMPTZ(3) NOT NULL,
    "validTo" TIMESTAMPTZ(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HallTypePrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeatTypeSurcharge" (
    "id" UUID NOT NULL,
    "seatType" "SeatType" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "validFrom" TIMESTAMPTZ(3) NOT NULL,
    "validTo" TIMESTAMPTZ(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeatTypeSurcharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimePriceAdjustment" (
    "id" UUID NOT NULL,
    "locationId" UUID,
    "nameSq" TEXT NOT NULL,
    "nameEn" TEXT,
    "daysOfWeek" INTEGER[],
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "kind" "AdjustmentKind" NOT NULL,
    "value" INTEGER NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "validFrom" TIMESTAMPTZ(3) NOT NULL,
    "validTo" TIMESTAMPTZ(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimePriceAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketCategory" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "nameSq" TEXT NOT NULL,
    "nameEn" TEXT,
    "descriptionSq" TEXT,
    "descriptionEn" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TicketCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketCategoryDiscount" (
    "id" UUID NOT NULL,
    "ticketCategoryId" UUID NOT NULL,
    "kind" "AdjustmentKind" NOT NULL,
    "value" INTEGER NOT NULL,
    "validFrom" TIMESTAMPTZ(3) NOT NULL,
    "validTo" TIMESTAMPTZ(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketCategoryDiscount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WholeHallPrice" (
    "id" UUID NOT NULL,
    "hallId" UUID NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "validFrom" TIMESTAMPTZ(3) NOT NULL,
    "validTo" TIMESTAMPTZ(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WholeHallPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "preferredLocale" "Locale" NOT NULL DEFAULT 'sq',
    "role" "UserRole" NOT NULL DEFAULT 'CUSTOMER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagerLocation" (
    "userId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManagerLocation_pkey" PRIMARY KEY ("userId","locationId")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "seatHoldMinutes" INTEGER NOT NULL DEFAULT 10,
    "cancellationCutoffMinutes" INTEGER NOT NULL DEFAULT 120,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedById" UUID,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "showtimeId" UUID NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'HELD',
    "holdExpiresAt" TIMESTAMPTZ(3),
    "totalCents" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'EUR',
    "ageRatingConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "isWholeHall" BOOLEAN NOT NULL DEFAULT false,
    "wholeHallPriceCents" INTEGER,
    "wholeHallBreakdown" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "confirmedAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingSeat" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "seatId" UUID NOT NULL,
    "ticketCategoryId" UUID NOT NULL,
    "ticketCategoryCode" TEXT NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "priceBreakdown" JSONB NOT NULL,

    CONSTRAINT "BookingSeat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeatReservation" (
    "showtimeId" UUID NOT NULL,
    "seatId" UUID NOT NULL,
    "hallId" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeatReservation_pkey" PRIMARY KEY ("showtimeId","seatId")
);

-- CreateTable
CREATE TABLE "WholeHallReservation" (
    "showtimeId" UUID NOT NULL,
    "hallId" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WholeHallReservation_pkey" PRIMARY KEY ("showtimeId")
);

-- CreateTable
CREATE TABLE "MenuItem" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "nameSq" TEXT NOT NULL,
    "nameEn" TEXT,
    "descriptionSq" TEXT,
    "descriptionEn" TEXT,
    "category" "MenuCategory" NOT NULL,
    "imagePath" TEXT,
    "isCombo" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComboComponent" (
    "comboId" UUID NOT NULL,
    "componentId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ComboComponent_pkey" PRIMARY KEY ("comboId","componentId")
);

-- CreateTable
CREATE TABLE "LocationMenuItem" (
    "id" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "menuItemId" UUID NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LocationMenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingFoodItem" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "menuItemId" UUID NOT NULL,
    "nameSq" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "fulfillment" "Fulfillment" NOT NULL DEFAULT 'PICKUP_AT_COUNTER',

    CONSTRAINT "BookingFoodItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemoPayment" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'EUR',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL DEFAULT 'demo',
    "reference" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "succeededAt" TIMESTAMPTZ(3),
    "refundedAt" TIMESTAMPTZ(3),

    CONSTRAINT "DemoPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Location_slug_key" ON "Location"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "HallType_code_key" ON "HallType"("code");

-- CreateIndex
CREATE INDEX "Hall_hallTypeId_idx" ON "Hall"("hallTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "Hall_locationId_name_key" ON "Hall"("locationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Seat_hallId_rowLabel_number_key" ON "Seat"("hallId", "rowLabel", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Seat_id_hallId_key" ON "Seat"("id", "hallId");

-- CreateIndex
CREATE UNIQUE INDEX "Movie_slug_key" ON "Movie"("slug");

-- CreateIndex
CREATE INDEX "Movie_status_idx" ON "Movie"("status");

-- CreateIndex
CREATE INDEX "Showtime_hallId_startsAt_idx" ON "Showtime"("hallId", "startsAt");

-- CreateIndex
CREATE INDEX "Showtime_movieId_startsAt_idx" ON "Showtime"("movieId", "startsAt");

-- CreateIndex
CREATE INDEX "Showtime_startsAt_idx" ON "Showtime"("startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Showtime_id_hallId_key" ON "Showtime"("id", "hallId");

-- CreateIndex
CREATE INDEX "HallTypePrice_hallTypeId_locationId_idx" ON "HallTypePrice"("hallTypeId", "locationId");

-- CreateIndex
CREATE INDEX "SeatTypeSurcharge_seatType_idx" ON "SeatTypeSurcharge"("seatType");

-- CreateIndex
CREATE INDEX "TimePriceAdjustment_locationId_idx" ON "TimePriceAdjustment"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketCategory_code_key" ON "TicketCategory"("code");

-- CreateIndex
CREATE INDEX "TicketCategoryDiscount_ticketCategoryId_idx" ON "TicketCategoryDiscount"("ticketCategoryId");

-- CreateIndex
CREATE INDEX "WholeHallPrice_hallId_idx" ON "WholeHallPrice"("hallId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "ManagerLocation_locationId_idx" ON "ManagerLocation"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_code_key" ON "Booking"("code");

-- CreateIndex
CREATE INDEX "Booking_userId_createdAt_idx" ON "Booking"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Booking_showtimeId_status_idx" ON "Booking"("showtimeId", "status");

-- CreateIndex
CREATE INDEX "Booking_status_holdExpiresAt_idx" ON "Booking"("status", "holdExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_id_showtimeId_key" ON "Booking"("id", "showtimeId");

-- CreateIndex
CREATE INDEX "BookingSeat_seatId_idx" ON "BookingSeat"("seatId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingSeat_bookingId_seatId_key" ON "BookingSeat"("bookingId", "seatId");

-- CreateIndex
CREATE INDEX "SeatReservation_bookingId_idx" ON "SeatReservation"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "WholeHallReservation_bookingId_key" ON "WholeHallReservation"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "MenuItem_slug_key" ON "MenuItem"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "LocationMenuItem_locationId_menuItemId_key" ON "LocationMenuItem"("locationId", "menuItemId");

-- CreateIndex
CREATE INDEX "BookingFoodItem_bookingId_idx" ON "BookingFoodItem"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "DemoPayment_reference_key" ON "DemoPayment"("reference");

-- CreateIndex
CREATE INDEX "DemoPayment_bookingId_idx" ON "DemoPayment"("bookingId");

-- AddForeignKey
ALTER TABLE "Hall" ADD CONSTRAINT "Hall_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hall" ADD CONSTRAINT "Hall_hallTypeId_fkey" FOREIGN KEY ("hallTypeId") REFERENCES "HallType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Seat" ADD CONSTRAINT "Seat_hallId_fkey" FOREIGN KEY ("hallId") REFERENCES "Hall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Showtime" ADD CONSTRAINT "Showtime_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Showtime" ADD CONSTRAINT "Showtime_hallId_fkey" FOREIGN KEY ("hallId") REFERENCES "Hall"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HallTypePrice" ADD CONSTRAINT "HallTypePrice_hallTypeId_fkey" FOREIGN KEY ("hallTypeId") REFERENCES "HallType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HallTypePrice" ADD CONSTRAINT "HallTypePrice_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimePriceAdjustment" ADD CONSTRAINT "TimePriceAdjustment_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketCategoryDiscount" ADD CONSTRAINT "TicketCategoryDiscount_ticketCategoryId_fkey" FOREIGN KEY ("ticketCategoryId") REFERENCES "TicketCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WholeHallPrice" ADD CONSTRAINT "WholeHallPrice_hallId_fkey" FOREIGN KEY ("hallId") REFERENCES "Hall"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerLocation" ADD CONSTRAINT "ManagerLocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerLocation" ADD CONSTRAINT "ManagerLocation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppSettings" ADD CONSTRAINT "AppSettings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_showtimeId_fkey" FOREIGN KEY ("showtimeId") REFERENCES "Showtime"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingSeat" ADD CONSTRAINT "BookingSeat_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingSeat" ADD CONSTRAINT "BookingSeat_seatId_fkey" FOREIGN KEY ("seatId") REFERENCES "Seat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingSeat" ADD CONSTRAINT "BookingSeat_ticketCategoryId_fkey" FOREIGN KEY ("ticketCategoryId") REFERENCES "TicketCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatReservation" ADD CONSTRAINT "SeatReservation_showtimeId_hallId_fkey" FOREIGN KEY ("showtimeId", "hallId") REFERENCES "Showtime"("id", "hallId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SeatReservation" ADD CONSTRAINT "SeatReservation_seatId_hallId_fkey" FOREIGN KEY ("seatId", "hallId") REFERENCES "Seat"("id", "hallId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SeatReservation" ADD CONSTRAINT "SeatReservation_bookingId_showtimeId_fkey" FOREIGN KEY ("bookingId", "showtimeId") REFERENCES "Booking"("id", "showtimeId") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "WholeHallReservation" ADD CONSTRAINT "WholeHallReservation_showtimeId_hallId_fkey" FOREIGN KEY ("showtimeId", "hallId") REFERENCES "Showtime"("id", "hallId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "WholeHallReservation" ADD CONSTRAINT "WholeHallReservation_bookingId_showtimeId_fkey" FOREIGN KEY ("bookingId", "showtimeId") REFERENCES "Booking"("id", "showtimeId") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ComboComponent" ADD CONSTRAINT "ComboComponent_comboId_fkey" FOREIGN KEY ("comboId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComboComponent" ADD CONSTRAINT "ComboComponent_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "MenuItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationMenuItem" ADD CONSTRAINT "LocationMenuItem_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationMenuItem" ADD CONSTRAINT "LocationMenuItem_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingFoodItem" ADD CONSTRAINT "BookingFoodItem_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingFoodItem" ADD CONSTRAINT "BookingFoodItem_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemoPayment" ADD CONSTRAINT "DemoPayment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =============================================================================================
-- Kinemax: database-level guarantees that Prisma's schema language cannot express.
-- Each block explains what it protects. See docs/data-model.md for the overview.
-- =============================================================================================

-- [G0] Sessions run in UTC. Prisma's pg adapter sends timestamps without an offset, so PostgreSQL
-- interprets them in the session time zone; a non-UTC server default (e.g. Europe/Paris from the
-- Windows installer) would silently shift every stored instant and break now()-based checks.
-- The app also pins TimeZone=UTC per connection (src/db/prisma.ts); this covers the Prisma CLI,
-- Prisma Studio and psql. Requires owning the database; otherwise only a notice is raised.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_database d
    WHERE d.datname = current_database() AND pg_get_userbyid(d.datdba) = current_user
  ) THEN
    EXECUTE format('ALTER DATABASE %I SET "TimeZone" TO %L', current_database(), 'UTC');
  ELSE
    RAISE NOTICE 'Not the database owner: set TimeZone = UTC for % manually', current_database();
  END IF;
END $$;
SET "TimeZone" TO 'UTC';

-- [G1] btree_gist lets one GiST index combine "=" on a uuid column with "&&" on a time range.
-- It is a trusted extension, so the database owner (the kinemax role, not a superuser) can create it.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- [G2] Two active showtimes can never overlap in the same hall. The range is [startsAt, endsAt),
-- so a show may start exactly when the previous one (incl. cleaning buffer) ends. Deactivated
-- showtimes are ignored, so a cancelled slot can be reused.
ALTER TABLE "Showtime" ADD CONSTRAINT "Showtime_ends_after_start" CHECK ("endsAt" > "startsAt");
ALTER TABLE "Showtime" ADD CONSTRAINT "Showtime_no_overlap_in_hall"
  EXCLUDE USING gist ("hallId" WITH =, tstzrange("startsAt", "endsAt", '[)') WITH &&)
  WHERE ("isActive");

-- [G3] Money is integer cents and never negative; quantities are positive; only EUR for now.
ALTER TABLE "HallTypePrice" ADD CONSTRAINT "HallTypePrice_price_nonneg" CHECK ("priceCents" >= 0);
ALTER TABLE "SeatTypeSurcharge" ADD CONSTRAINT "SeatTypeSurcharge_amount_nonneg" CHECK ("amountCents" >= 0);
ALTER TABLE "WholeHallPrice" ADD CONSTRAINT "WholeHallPrice_price_nonneg" CHECK ("priceCents" >= 0);
ALTER TABLE "LocationMenuItem" ADD CONSTRAINT "LocationMenuItem_price_nonneg" CHECK ("priceCents" >= 0);
ALTER TABLE "BookingSeat" ADD CONSTRAINT "BookingSeat_price_nonneg" CHECK ("unitPriceCents" >= 0);
ALTER TABLE "BookingFoodItem" ADD CONSTRAINT "BookingFoodItem_price_nonneg" CHECK ("unitPriceCents" >= 0);
ALTER TABLE "BookingFoodItem" ADD CONSTRAINT "BookingFoodItem_quantity_range" CHECK ("quantity" BETWEEN 1 AND 50);
ALTER TABLE "ComboComponent" ADD CONSTRAINT "ComboComponent_quantity_positive" CHECK ("quantity" >= 1);
ALTER TABLE "ComboComponent" ADD CONSTRAINT "ComboComponent_not_self" CHECK ("comboId" <> "componentId");
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_total_nonneg" CHECK ("totalCents" >= 0);
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_currency_eur" CHECK ("currency" = 'EUR');
ALTER TABLE "DemoPayment" ADD CONSTRAINT "DemoPayment_amount_nonneg" CHECK ("amountCents" >= 0);
ALTER TABLE "DemoPayment" ADD CONSTRAINT "DemoPayment_currency_eur" CHECK ("currency" = 'EUR');

-- [G4] Price rules: sane validity windows, time windows inside one local day, ISO weekdays,
-- percentages within -100..100 (adjustments) or 0..100 (discounts), discounts never negative.
ALTER TABLE "HallTypePrice" ADD CONSTRAINT "HallTypePrice_valid_range" CHECK ("validTo" IS NULL OR "validTo" > "validFrom");
ALTER TABLE "SeatTypeSurcharge" ADD CONSTRAINT "SeatTypeSurcharge_valid_range" CHECK ("validTo" IS NULL OR "validTo" > "validFrom");
ALTER TABLE "WholeHallPrice" ADD CONSTRAINT "WholeHallPrice_valid_range" CHECK ("validTo" IS NULL OR "validTo" > "validFrom");
ALTER TABLE "TicketCategoryDiscount" ADD CONSTRAINT "TicketCategoryDiscount_valid_range" CHECK ("validTo" IS NULL OR "validTo" > "validFrom");
ALTER TABLE "TimePriceAdjustment" ADD CONSTRAINT "TimePriceAdjustment_valid_range" CHECK ("validTo" IS NULL OR "validTo" > "validFrom");
ALTER TABLE "TimePriceAdjustment" ADD CONSTRAINT "TimePriceAdjustment_window"
  CHECK ("startMinute" >= 0 AND "startMinute" < "endMinute" AND "endMinute" <= 1440);
ALTER TABLE "TimePriceAdjustment" ADD CONSTRAINT "TimePriceAdjustment_days"
  CHECK (cardinality("daysOfWeek") > 0 AND "daysOfWeek" <@ ARRAY[1, 2, 3, 4, 5, 6, 7]);
ALTER TABLE "TimePriceAdjustment" ADD CONSTRAINT "TimePriceAdjustment_percent_range"
  CHECK ("kind" <> 'PERCENT' OR "value" BETWEEN -100 AND 100);
ALTER TABLE "TicketCategoryDiscount" ADD CONSTRAINT "TicketCategoryDiscount_value"
  CHECK ("value" >= 0 AND ("kind" <> 'PERCENT' OR "value" <= 100));

-- [G5] Catalog sanity: movie length, YouTube id shape, seat/hall geometry, couple sofas are 2 wide.
ALTER TABLE "Movie" ADD CONSTRAINT "Movie_duration_range" CHECK ("durationMinutes" BETWEEN 1 AND 600);
ALTER TABLE "Movie" ADD CONSTRAINT "Movie_trailer_id_format"
  CHECK ("trailerYoutubeId" IS NULL OR "trailerYoutubeId" ~ '^[A-Za-z0-9_-]{11}$');
ALTER TABLE "Seat" ADD CONSTRAINT "Seat_number_positive" CHECK ("number" >= 1);
ALTER TABLE "Seat" ADD CONSTRAINT "Seat_width_units" CHECK ("widthUnits" BETWEEN 1 AND 4);
ALTER TABLE "Seat" ADD CONSTRAINT "Seat_couple_is_double" CHECK ("seatType" <> 'COUPLE' OR "widthUnits" = 2);
ALTER TABLE "Hall" ADD CONSTRAINT "Hall_screen_size_positive" CHECK ("screenWidthM" > 0 AND "screenHeightM" > 0);

-- [G6] Users: emails are stored normalized (trimmed, lowercase), so the unique index really
-- prevents duplicates like "Ana@x.test" vs "ana@x.test".
ALTER TABLE "User" ADD CONSTRAINT "User_email_normalized"
  CHECK ("email" = lower(btrim("email")) AND position('@' IN "email") > 1);
ALTER TABLE "Session" ADD CONSTRAINT "Session_expires_after_creation" CHECK ("expiresAt" > "createdAt");

-- [G7] Settings are a single row with sane values (defaults: hold 10 min, cancel until 120 min before).
ALTER TABLE "AppSettings" ADD CONSTRAINT "AppSettings_singleton" CHECK ("id" = 1);
ALTER TABLE "AppSettings" ADD CONSTRAINT "AppSettings_hold_minutes" CHECK ("seatHoldMinutes" BETWEEN 1 AND 60);
ALTER TABLE "AppSettings" ADD CONSTRAINT "AppSettings_cancellation_cutoff" CHECK ("cancellationCutoffMinutes" >= 0);
INSERT INTO "AppSettings" ("id", "seatHoldMinutes", "cancellationCutoffMinutes", "updatedAt")
VALUES (1, 10, 120, CURRENT_TIMESTAMP);

-- [G8] Booking consistency: random public code shape (Crockford base32, 16 chars = 80 bits),
-- a HELD booking always has an expiry, timestamps match the status, whole-hall bookings carry a
-- whole-hall price, and only demo payments exist.
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_code_format" CHECK ("code" ~ '^[0-9A-HJKMNP-TV-Z]{16}$');
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_held_has_expiry" CHECK ("status" <> 'HELD' OR "holdExpiresAt" IS NOT NULL);
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_confirmed_has_timestamp"
  CHECK ("status" NOT IN ('CONFIRMED', 'REFUNDED') OR "confirmedAt" IS NOT NULL);
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_cancelled_has_timestamp" CHECK ("status" <> 'CANCELLED' OR "cancelledAt" IS NOT NULL);
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_whole_hall_price"
  CHECK ("isWholeHall" = ("wholeHallPriceCents" IS NOT NULL) AND ("wholeHallPriceCents" IS NULL OR "wholeHallPriceCents" >= 0));
ALTER TABLE "DemoPayment" ADD CONSTRAINT "DemoPayment_provider_demo" CHECK ("provider" = 'demo');

-- [G9] Booking status machine. New bookings start as HELD. Allowed transitions:
--   HELD -> CONFIRMED (only while the hold has not expired), CANCELLED, EXPIRED
--   CONFIRMED -> CANCELLED, REFUNDED;  CANCELLED -> REFUNDED
-- Released bookings (CANCELLED, EXPIRED, REFUNDED) can never become active again: their seat
-- locks are already gone (G11), so reviving them would bypass the double-booking guard.
CREATE FUNCTION kinemax_booking_status_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'HELD' THEN
      RAISE EXCEPTION 'new bookings must start as HELD (got %)', NEW."status" USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW."status" = OLD."status" THEN
    RETURN NEW;
  END IF;
  IF NOT (
    (OLD."status" = 'HELD' AND NEW."status" IN ('CONFIRMED', 'CANCELLED', 'EXPIRED')) OR
    (OLD."status" = 'CONFIRMED' AND NEW."status" IN ('CANCELLED', 'REFUNDED')) OR
    (OLD."status" = 'CANCELLED' AND NEW."status" = 'REFUNDED')
  ) THEN
    RAISE EXCEPTION 'booking status cannot change from % to %', OLD."status", NEW."status" USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."status" = 'HELD' AND NEW."status" = 'CONFIRMED' AND OLD."holdExpiresAt" <= now() THEN
    RAISE EXCEPTION 'cannot confirm a booking whose hold has expired' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Booking_status_guard" BEFORE INSERT OR UPDATE OF "status" ON "Booking"
  FOR EACH ROW EXECUTE FUNCTION kinemax_booking_status_guard();

-- [G10] Seat locks. The primary key (showtimeId, seatId) of SeatReservation makes it impossible to
-- hold/book the same seat twice for one showtime, and WholeHallReservation's primary key
-- (showtimeId) allows one whole-hall booking per showtime. Composite foreign keys force the seat
-- and the booking to belong to that showtime and its hall. This trigger adds: locks only for active
-- (HELD/CONFIRMED) bookings; per-seat locks never in whole-hall-only halls (suites); whole-hall
-- locks only for whole-hall bookings of whole-hall-only halls. The booking row is read FOR SHARE,
-- so a concurrent status change (e.g. expiry) and this insert are serialized.
CREATE FUNCTION kinemax_reservation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  booking_status "BookingStatus";
  booking_whole_hall boolean;
  hall_whole_only boolean;
BEGIN
  SELECT b."status", b."isWholeHall" INTO booking_status, booking_whole_hall
    FROM "Booking" b WHERE b."id" = NEW."bookingId" FOR SHARE;
  SELECT h."wholeHallOnly" INTO hall_whole_only FROM "Hall" h WHERE h."id" = NEW."hallId";
  IF booking_status IS NULL OR booking_status NOT IN ('HELD', 'CONFIRMED') THEN
    RAISE EXCEPTION 'reservations require an active (HELD or CONFIRMED) booking' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_TABLE_NAME = 'SeatReservation' THEN
    IF booking_whole_hall OR hall_whole_only THEN
      RAISE EXCEPTION 'this hall can only be booked as a whole' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NOT booking_whole_hall OR NOT hall_whole_only THEN
    RAISE EXCEPTION 'whole-hall reservations are only for whole-hall bookings of whole-hall-only halls' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "SeatReservation_guard" BEFORE INSERT OR UPDATE ON "SeatReservation"
  FOR EACH ROW EXECUTE FUNCTION kinemax_reservation_guard();
CREATE TRIGGER "WholeHallReservation_guard" BEFORE INSERT OR UPDATE ON "WholeHallReservation"
  FOR EACH ROW EXECUTE FUNCTION kinemax_reservation_guard();

-- [G11] Releasing seats is atomic with the status change: when a booking leaves HELD/CONFIRMED,
-- its seat and whole-hall locks are deleted in the same transaction, so the seats are bookable
-- again immediately. BookingSeat rows (history + price snapshot) are kept.
CREATE FUNCTION kinemax_release_reservations() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."status" NOT IN ('HELD', 'CONFIRMED') THEN
    DELETE FROM "SeatReservation" WHERE "bookingId" = NEW."id";
    DELETE FROM "WholeHallReservation" WHERE "bookingId" = NEW."id";
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER "Booking_release_reservations" AFTER UPDATE OF "status" ON "Booking"
  FOR EACH ROW WHEN (NEW."status" IS DISTINCT FROM OLD."status")
  EXECUTE FUNCTION kinemax_release_reservations();
