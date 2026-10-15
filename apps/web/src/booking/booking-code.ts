/** ABCD1234EFGH5678 → "ABCD 1234 EFGH 5678" (easier to read out at the counter). */
export const groupCode = (code: string) => code.replace(/(.{4})(?=.)/g, '$1 ');
