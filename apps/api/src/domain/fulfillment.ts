// Food & drinks fulfillment rules for orders placed with a booking.

export type FulfillmentCode = 'PICKUP_AT_COUNTER' | 'DELIVER_TO_SEAT';

export class FulfillmentError extends Error {
  override name = 'FulfillmentError';
}

/**
 * Delivery to the seat is only possible in halls whose type allows it (HallType.allowsSeatDelivery:
 * VIP_RECLINER and PRIVATE_SUITE in the seed). Pickup at the counter is always possible.
 */
export function isFulfillmentAllowed(
  hallType: { allowsSeatDelivery: boolean },
  fulfillment: FulfillmentCode,
): boolean {
  return fulfillment === 'PICKUP_AT_COUNTER' || hallType.allowsSeatDelivery;
}

export function assertFulfillmentAllowed(
  hallType: { code: string; allowsSeatDelivery: boolean },
  fulfillment: FulfillmentCode,
): void {
  if (!isFulfillmentAllowed(hallType, fulfillment)) {
    throw new FulfillmentError(
      `${fulfillment} is not available in ${hallType.code} halls; choose PICKUP_AT_COUNTER`,
    );
  }
}
