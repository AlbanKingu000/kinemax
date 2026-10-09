-- DropIndex
DROP INDEX "BookingSeat_bookingId_seatId_key";

-- AlterTable
ALTER TABLE "BookingSeat" ADD COLUMN     "occupant" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "seatSurchargeCents" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "BookingSeat_bookingId_seatId_occupant_key" ON "BookingSeat"("bookingId", "seatId", "occupant");


-- =============================================================================================
-- Kinemax G12: a COUPLE sofa carries exactly 2 tickets (one per person, each with its own ticket
-- category), every other seat exactly 1. The sofa surcharge is charged once per sofa and stored on
-- occupant 1. The seat lock (SeatReservation) stays one row per seat. See docs/data-model.md.
-- =============================================================================================

-- [G12a] Ticket capacity per seat type.
CREATE FUNCTION kinemax_seat_ticket_capacity(seat_type "SeatType") RETURNS integer
  LANGUAGE sql IMMUTABLE AS $$ SELECT CASE WHEN seat_type = 'COUPLE' THEN 2 ELSE 1 END $$;

-- [G12b] Occupant numbers are 1..2; the once-per-seat surcharge is never negative and only
-- occupant 1 carries it, so it can never be charged twice for one sofa.
ALTER TABLE "BookingSeat" ADD CONSTRAINT "BookingSeat_occupant_range" CHECK ("occupant" BETWEEN 1 AND 2);
ALTER TABLE "BookingSeat" ADD CONSTRAINT "BookingSeat_surcharge_on_first_occupant"
  CHECK ("seatSurchargeCents" >= 0 AND ("occupant" = 1 OR "seatSurchargeCents" = 0));

-- [G12c] At most `capacity` tickets per seat and booking: the occupant number may not exceed the
-- capacity of the seat's type. Together with the unique key (bookingId, seatId, occupant) a
-- standard seat can hold only occupant 1 and a sofa only occupants 1 and 2.
CREATE FUNCTION kinemax_booking_seat_occupant_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  capacity integer;
BEGIN
  SELECT kinemax_seat_ticket_capacity(s."seatType") INTO capacity FROM "Seat" s WHERE s."id" = NEW."seatId";
  IF NEW."occupant" > capacity THEN
    RAISE EXCEPTION 'this seat takes % ticket(s); occupant % is not allowed', capacity, NEW."occupant"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "BookingSeat_occupant_guard" BEFORE INSERT OR UPDATE OF "seatId", "occupant" ON "BookingSeat"
  FOR EACH ROW EXECUTE FUNCTION kinemax_booking_seat_occupant_guard();

-- [G12d] Exactly `capacity` tickets per booked seat. Checked at COMMIT by a deferred constraint
-- trigger, so the two tickets of a sofa can be written one after the other in one transaction,
-- but a transaction can never commit a sofa with 1 ticket. 0 tickets is fine (e.g. the booking
-- and its rows were deleted).
CREATE FUNCTION kinemax_assert_seat_ticket_count(booking_id uuid, seat_id uuid) RETURNS void
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
      USING ERRCODE = 'check_violation';
  END IF;
END $$;
CREATE FUNCTION kinemax_booking_seat_count_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM kinemax_assert_seat_ticket_count(OLD."bookingId", OLD."seatId");
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM kinemax_assert_seat_ticket_count(NEW."bookingId", NEW."seatId");
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "BookingSeat_ticket_count" AFTER INSERT OR UPDATE OR DELETE ON "BookingSeat"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION kinemax_booking_seat_count_check();

-- [G12e] A seat that has tickets cannot switch to a seat type with a different ticket capacity
-- (e.g. COUPLE -> STANDARD), which would silently break G12 for its existing tickets. Deactivate
-- the seat and add a new one instead. Changes with the same capacity (STANDARD -> VIP) are fine.
CREATE FUNCTION kinemax_seat_type_change_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF kinemax_seat_ticket_capacity(NEW."seatType") <> kinemax_seat_ticket_capacity(OLD."seatType")
     AND EXISTS (SELECT 1 FROM "BookingSeat" WHERE "seatId" = NEW."id") THEN
    RAISE EXCEPTION 'seat % has tickets; it cannot change from % to %', NEW."id", OLD."seatType", NEW."seatType"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Seat_type_change_guard" BEFORE UPDATE OF "seatType" ON "Seat"
  FOR EACH ROW EXECUTE FUNCTION kinemax_seat_type_change_guard();

-- Tickets sold before this migration stay as history (priced under the old rule); report them.
DO $$
DECLARE
  mismatched integer;
BEGIN
  SELECT count(*) INTO mismatched FROM (
    SELECT bs."bookingId", bs."seatId", s."seatType", count(*) AS tickets
    FROM "BookingSeat" bs JOIN "Seat" s ON s."id" = bs."seatId"
    GROUP BY bs."bookingId", bs."seatId", s."seatType"
  ) t WHERE t.tickets <> kinemax_seat_ticket_capacity(t."seatType");
  IF mismatched > 0 THEN
    RAISE NOTICE '% booked seat(s) predate the two-ticket rule and are kept as history', mismatched;
  END IF;
END $$;
