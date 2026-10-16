-- [G14] Price rule versions (task 10). A price is changed by closing the current version
-- (validTo) and adding a new one, never by rewriting history. For one key, two active versions
-- may never be valid at the same time: [validFrom, validTo) ranges must not overlap (an open
-- validTo means "until further notice"). A NULL location means the global rule, its own key.
-- Time adjustments have no key (several windows may apply at once), so they are not covered.
ALTER TABLE "HallTypePrice" ADD CONSTRAINT "HallTypePrice_no_overlap" EXCLUDE USING gist (
  "hallTypeId" WITH =,
  (COALESCE("locationId", '00000000-0000-0000-0000-000000000000'::uuid)) WITH =,
  tstzrange("validFrom", "validTo", '[)') WITH &&
) WHERE ("isActive");

ALTER TABLE "SeatTypeSurcharge" ADD CONSTRAINT "SeatTypeSurcharge_no_overlap" EXCLUDE USING gist (
  "seatType" WITH =,
  tstzrange("validFrom", "validTo", '[)') WITH &&
) WHERE ("isActive");

ALTER TABLE "TicketCategoryDiscount" ADD CONSTRAINT "TicketCategoryDiscount_no_overlap"
  EXCLUDE USING gist (
    "ticketCategoryId" WITH =,
    tstzrange("validFrom", "validTo", '[)') WITH &&
  ) WHERE ("isActive");

ALTER TABLE "WholeHallPrice" ADD CONSTRAINT "WholeHallPrice_no_overlap" EXCLUDE USING gist (
  "hallId" WITH =,
  tstzrange("validFrom", "validTo", '[)') WITH &&
) WHERE ("isActive");
