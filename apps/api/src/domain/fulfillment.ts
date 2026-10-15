// Food & drinks fulfillment rules for orders placed with a booking.

export type FulfillmentCode = 'PICKUP_AT_COUNTER' | 'DELIVER_TO_SEAT';
export type ServeTimingCode = 'BEFORE_SHOW' | 'DURING_SHOW';

/** Food "during the show" is brought to the seat about this long after the start. */
export const DURING_SHOW_DELAY_MINUTES = 20;

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

/**
 * The serve timing stored with an order line: required for seat delivery, none for counter pickup
 * (the same rule as the database CHECK of migration food_serve_timing, G13).
 */
export function serveTimingFor(
  fulfillment: FulfillmentCode,
  serveTiming: ServeTimingCode | undefined,
): ServeTimingCode | null {
  if (fulfillment === 'DELIVER_TO_SEAT') {
    if (!serveTiming) throw new FulfillmentError('Seat delivery needs a serve timing.');
    return serveTiming;
  }
  if (serveTiming) throw new FulfillmentError('Counter pickup has no serve timing.');
  return null;
}
