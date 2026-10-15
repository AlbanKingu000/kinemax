-- CreateEnum
CREATE TYPE "ServeTiming" AS ENUM ('BEFORE_SHOW', 'DURING_SHOW');

-- AlterTable
ALTER TABLE "BookingFoodItem" ADD COLUMN     "serveTiming" "ServeTiming";

-- [G13] Food delivered to the seat has a serve time (before the show, or about 20 minutes after
-- the start); food picked up at the counter has none. Existing deliveries (none in the seed) are
-- served before the show, so the constraint can be added.
UPDATE "BookingFoodItem" SET "serveTiming" = 'BEFORE_SHOW'
  WHERE "fulfillment" = 'DELIVER_TO_SEAT' AND "serveTiming" IS NULL;
UPDATE "BookingFoodItem" SET "serveTiming" = NULL
  WHERE "fulfillment" = 'PICKUP_AT_COUNTER' AND "serveTiming" IS NOT NULL;
ALTER TABLE "BookingFoodItem" ADD CONSTRAINT "BookingFoodItem_serveTiming_check"
  CHECK (("fulfillment" = 'DELIVER_TO_SEAT') = ("serveTiming" IS NOT NULL));
