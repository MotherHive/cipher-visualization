import { PRINTABLE_CHARS, PRINTABLE_START, PRINTABLE_RANGE } from "./constants.js";

const SUBSTITUTION_ALPHABET = PRINTABLE_CHARS.join("");

export function randomKey(cipherType) {
  switch (cipherType) {
    case "caesar": {
      return String(1 + Math.floor(Math.random() * (PRINTABLE_RANGE - 1)));
    }
    case "substitution": {
      let shuffled = SUBSTITUTION_ALPHABET;

      while (shuffled === SUBSTITUTION_ALPHABET) {
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
        word += String.fromCharCode(PRINTABLE_START + Math.floor(Math.random() * PRINTABLE_RANGE));
      }
      return word;
    }
    default:
      return "";
  }
}
