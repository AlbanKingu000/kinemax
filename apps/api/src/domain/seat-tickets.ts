// How many tickets a seat sells. Mirrors the database rule G12 (kinemax_seat_ticket_capacity).

import type { SeatTypeCode } from './seat-layout.js';

/** A COUPLE sofa is one seat (one lock) for two people, so it sells 2 tickets; every other seat 1. */
export function ticketsPerSeat(seatType: SeatTypeCode): number {
  return seatType === 'COUPLE' ? 2 : 1;
}

export class SeatTicketCountError extends Error {
  override name = 'SeatTicketCountError';
}

/** Throws when the number of tickets requested for a seat does not match its seat type. */
export function assertTicketCount(seatType: SeatTypeCode, ticketCount: number): void {
  const expected = ticketsPerSeat(seatType);
  if (ticketCount !== expected) {
    throw new SeatTicketCountError(
      `A ${seatType} seat needs exactly ${String(expected)} ticket(s), got ${String(ticketCount)}`,
    );
  }
}
