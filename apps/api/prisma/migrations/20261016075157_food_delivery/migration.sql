-- AlterTable
ALTER TABLE "BookingFoodItem" ADD COLUMN     "deliveredAt" TIMESTAMPTZ(3),
ADD COLUMN     "deliveredById" UUID;

-- AddForeignKey
ALTER TABLE "BookingFoodItem" ADD CONSTRAINT "BookingFoodItem_deliveredById_fkey" FOREIGN KEY ("deliveredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
