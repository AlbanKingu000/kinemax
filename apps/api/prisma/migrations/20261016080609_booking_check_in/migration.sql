-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "checkedInAt" TIMESTAMPTZ(3),
ADD COLUMN     "checkedInById" UUID;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_checkedInById_fkey" FOREIGN KEY ("checkedInById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
