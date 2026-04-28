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
    case "product": {
      // 3–6 char transposition key, then a 95-char substitution permutation,
      // joined with "|". Reusing the vigenere/substitution generators keeps the
      // distribution identical to those single-cipher keys.
      const transLen = 3 + Math.floor(Math.random() * 4); // 3–6 chars
      let transKey = "";
      for (let i = 0; i < transLen; i++) {
        let ch;
        do {
          ch = String.fromCharCode(PRINTABLE_START + Math.floor(Math.random() * PRINTABLE_RANGE));
        } while (ch === "|"); // "|" is the trans/subst separator in the combined key
        transKey += ch;
      }
      let subKey = SUBSTITUTION_ALPHABET;
      while (subKey === SUBSTITUTION_ALPHABET) {
        const alphabet = [...PRINTABLE_CHARS];
        for (let i = alphabet.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [alphabet[i], alphabet[j]] = [alphabet[j], alphabet[i]];
        }
        subKey = alphabet.join("");
      }
      return `${transKey}|${subKey}`;
    }
    case "lucifer": {
      // 16-bit key as 4 hex digits.
      const k = Math.floor(Math.random() * 0x10000);
      return k.toString(16).padStart(4, "0");
    }
    default:
      return "";
  }
}
