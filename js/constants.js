export const PRINTABLE_START = 32;  // space
export const PRINTABLE_END = 126;    // tilde ~
export const PRINTABLE_RANGE = PRINTABLE_END - PRINTABLE_START + 1; // 95
export const PRINTABLE_CHARS = Array.from(
  { length: PRINTABLE_RANGE },
  (_, i) => String.fromCharCode(PRINTABLE_START + i)
);
export const MAX_TEXT_LENGTH = 256;
