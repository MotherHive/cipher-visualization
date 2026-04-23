const PRINTABLE_START = 32;
const PRINTABLE_END = 126;
const PRINTABLE_CHARS = Array.from(
  { length: PRINTABLE_END - PRINTABLE_START + 1 },
  (_, i) => String.fromCharCode(PRINTABLE_START + i)
);

export function randomKey(cipherType) {
  switch (cipherType) {
    case "caesar": {
      return String(1 + Math.floor(Math.random() * 94));
    }
    case "substitution": {
      const identity = PRINTABLE_CHARS.join("");
      let shuffled = identity;

      while (shuffled === identity) {
        const alphabet = [...PRINTABLE_CHARS];
        // Fisher-Yates shuffle
        for (let i = alphabet.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [alphabet[i], alphabet[j]] = [alphabet[j], alphabet[i]];
        }
        shuffled = alphabet.join("");
      }

      return shuffled;
    }
    case "vigenere": {
      const len = 3 + Math.floor(Math.random() * 6); // 3–8 chars
      let word = "";
      for (let i = 0; i < len; i++) {
        word += String.fromCharCode(65 + Math.floor(Math.random() * 26));
      }
      return word;
    }
    default:
      return "";
  }
}
