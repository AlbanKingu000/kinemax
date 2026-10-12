import type { PricingRules } from '../domain/pricing.js';
import type { PrismaClient } from '../generated/prisma/client.js';

/**
 * Loads the active price rules the pricing function needs for some halls of one location.
 * Validity windows (validFrom/validTo) are applied by the pricing function itself, at `pricedAt`.
 */
export async function loadPricingRules(
  prisma: PrismaClient,
  scope: { locationId: string; hallIds: readonly string[]; ticketCategoryIds: readonly string[] },
): Promise<PricingRules> {
  const locationRule = { OR: [{ locationId: null }, { locationId: scope.locationId }] };
  const [hallTypePrices, seatTypeSurcharges, timeAdjustments, categoryDiscounts, wholeHallPrices] =
    await Promise.all([
      prisma.hallTypePrice.findMany({ where: { isActive: true, ...locationRule } }),
      prisma.seatTypeSurcharge.findMany({ where: { isActive: true } }),
      prisma.timePriceAdjustment.findMany({ where: { isActive: true, ...locationRule } }),
      prisma.ticketCategoryDiscount.findMany({
        where: { isActive: true, ticketCategoryId: { in: [...scope.ticketCategoryIds] } },
      }),
      prisma.wholeHallPrice.findMany({
        where: { isActive: true, hallId: { in: [...scope.hallIds] } },
      }),
    ]);
  return {
    hallTypePrices,
    seatTypeSurcharges,
    timeAdjustments,
    categoryDiscounts,
    wholeHallPrices,
  };
}
