import { randomInt } from 'node:crypto';

/** Crockford base32 alphabet (no I, L, O, U: easy to read aloud and to type). */
export const BOOKING_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const BOOKING_CODE_LENGTH = 16;
export const BOOKING_CODE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{16}$/;

/**
 * Public booking code for the QR ticket: 16 crypto-random Crockford base32 characters (80 bits),
 * so codes cannot be guessed or enumerated. The format is also enforced by a DB CHECK constraint.
 */
export function generateBookingCode(): string {
  let code = '';
  for (let i = 0; i < BOOKING_CODE_LENGTH; i++) {
    code += BOOKING_CODE_ALPHABET.charAt(randomInt(BOOKING_CODE_ALPHABET.length));
  }
  return code;
}
