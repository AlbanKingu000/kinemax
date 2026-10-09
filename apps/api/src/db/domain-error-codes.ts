// Custom SQLSTATEs raised by our database triggers (migration trigger_error_codes). The class "KX"
// is unused by PostgreSQL, so these never collide with built-in errors. Branch on these codes, never
// on PostgreSQL message text (it can be translated via lc_messages).
export const DOMAIN_SQLSTATE = {
  /** Booking status change not allowed (also: a new booking that does not start as HELD). */
  bookingTransition: 'KX001',
  /** A HELD booking whose hold has expired cannot be confirmed. */
  holdExpired: 'KX002',
  /** Seat or whole-hall locks need an active (HELD or CONFIRMED) booking. */
  reservationNeedsActiveBooking: 'KX003',
  /** Per-seat lock in a whole-hall-only hall, or a whole-hall lock in a per-seat hall. */
  hallBookingMode: 'KX004',
  /** Occupant above the seat's ticket capacity, or the wrong number of tickets at COMMIT. */
  seatTicketCount: 'KX005',
  /** A seat with tickets cannot change to a seat type with a different ticket capacity. */
  seatTypeChange: 'KX006',
} as const;

export type DomainSqlState = (typeof DOMAIN_SQLSTATE)[keyof typeof DOMAIN_SQLSTATE];
