-- =============================================================================================
-- Kinemax: stable custom SQLSTATEs for domain trigger errors (see docs/data-model.md, "Error codes").
--
-- Until now our triggers raised the standard 23514 (check_violation), so the API could only tell
-- them apart from real CHECK constraints by the message text, which PostgreSQL may translate
-- (lc_messages). Every trigger now raises a dedicated code of the custom class "KX": SQLSTATE
-- classes starting with I-Z are implementation-defined in the SQL standard and PostgreSQL uses no
-- "KX" class, so these codes never collide with built-in errors. Logic is unchanged; only the
-- ERRCODE of each RAISE differs from the functions created in init_domain and
-- couple_seat_two_tickets.
--
--   KX001  booking status transition not allowed (also: new booking not HELD)
--   KX002  hold expired: a HELD booking can no longer be confirmed
--   KX003  seat/hall lock needs an active (HELD or CONFIRMED) booking
--   KX004  hall booking mode: per-seat lock in a whole-hall-only hall, or whole-hall lock elsewhere
--   KX005  seat ticket count: occupant above the seat's capacity, or wrong count at COMMIT
--   KX006  seat type change that would alter the ticket capacity of a seat that has tickets
-- =============================================================================================

-- [G9] Booking status machine: KX001 / KX002.
CREATE OR REPLACE FUNCTION kinemax_booking_status_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'HELD' THEN
      RAISE EXCEPTION 'new bookings must start as HELD (got %)', NEW."status" USING ERRCODE = 'KX001';
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
    RAISE EXCEPTION 'booking status cannot change from % to %', OLD."status", NEW."status" USING ERRCODE = 'KX001';
  END IF;
  IF OLD."status" = 'HELD' AND NEW."status" = 'CONFIRMED' AND OLD."holdExpiresAt" <= now() THEN
    RAISE EXCEPTION 'cannot confirm a booking whose hold has expired' USING ERRCODE = 'KX002';
  END IF;
  RETURN NEW;
END $$;

-- [G10] Seat and whole-hall locks: KX003 (booking not active) / KX004 (hall booking mode).
CREATE OR REPLACE FUNCTION kinemax_reservation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  booking_status "BookingStatus";
  booking_whole_hall boolean;
  hall_whole_only boolean;
BEGIN
  SELECT b."status", b."isWholeHall" INTO booking_status, booking_whole_hall
    FROM "Booking" b WHERE b."id" = NEW."bookingId" FOR SHARE;
  SELECT h."wholeHallOnly" INTO hall_whole_only FROM "Hall" h WHERE h."id" = NEW."hallId";
  IF booking_status IS NULL OR booking_status NOT IN ('HELD', 'CONFIRMED') THEN
    RAISE EXCEPTION 'reservations require an active (HELD or CONFIRMED) booking' USING ERRCODE = 'KX003';
  END IF;
  IF TG_TABLE_NAME = 'SeatReservation' THEN
    IF booking_whole_hall OR hall_whole_only THEN
      RAISE EXCEPTION 'this hall can only be booked as a whole' USING ERRCODE = 'KX004';
    END IF;
  ELSIF NOT booking_whole_hall OR NOT hall_whole_only THEN
    RAISE EXCEPTION 'whole-hall reservations are only for whole-hall bookings of whole-hall-only halls' USING ERRCODE = 'KX004';
  END IF;
  RETURN NEW;
END $$;

-- [G12c] Occupant above the seat's ticket capacity: KX005.
CREATE OR REPLACE FUNCTION kinemax_booking_seat_occupant_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  capacity integer;
BEGIN
  SELECT kinemax_seat_ticket_capacity(s."seatType") INTO capacity FROM "Seat" s WHERE s."id" = NEW."seatId";
  IF NEW."occupant" > capacity THEN
    RAISE EXCEPTION 'this seat takes % ticket(s); occupant % is not allowed', capacity, NEW."occupant"
      USING ERRCODE = 'KX005';
  END IF;
  RETURN NEW;
END $$;

-- [G12d] Wrong number of tickets on a booked seat at COMMIT: KX005.
CREATE OR REPLACE FUNCTION kinemax_assert_seat_ticket_count(booking_id uuid, seat_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  tickets integer;
  capacity integer;
BEGIN
  SELECT count(*) INTO tickets FROM "BookingSeat" WHERE "bookingId" = booking_id AND "seatId" = seat_id;
  IF tickets = 0 THEN
    RETURN;
  END IF;
  SELECT kinemax_seat_ticket_capacity(s."seatType") INTO capacity FROM "Seat" s WHERE s."id" = seat_id;
  IF tickets <> capacity THEN
    RAISE EXCEPTION 'a booked seat needs exactly % ticket(s), found %', capacity, tickets
      USING ERRCODE = 'KX005';
  END IF;
END $$;

-- [G12e] Seat type change on a seat with tickets: KX006.
CREATE OR REPLACE FUNCTION kinemax_seat_type_change_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF kinemax_seat_ticket_capacity(NEW."seatType") <> kinemax_seat_ticket_capacity(OLD."seatType")
     AND EXISTS (SELECT 1 FROM "BookingSeat" WHERE "seatId" = NEW."id") THEN
    RAISE EXCEPTION 'seat % has tickets; it cannot change from % to %', NEW."id", OLD."seatType", NEW."seatType"
      USING ERRCODE = 'KX006';
  END IF;
  RETURN NEW;
END $$;
