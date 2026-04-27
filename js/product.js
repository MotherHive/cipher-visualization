// Product cipher: monoalphabetic substitution applied AFTER columnar transposition.
//
//   encrypt(P, T, S) = substitute(transpose(P, T), S)
//   decrypt(C, T, S) = un_transpose(un_substitute(C, S), T)
//
// The user-facing key is a single string with the two parts separated by `|`:
//
//   "ZEBRA|<95-char permutation>"

import {
  PRINTABLE_START,
  PRINTABLE_END,
  PRINTABLE_RANGE,
} from "./constants.js";
import { columnarEncrypt, columnarDecrypt } from "./transposition.js";

const KEY_SEPARATOR = "|";

export function parseProductKey(combined) {
  const raw = combined ?? "";
  const sep = raw.indexOf(KEY_SEPARATOR);
  if (sep === -1) return { transKey: raw, subKey: "" };
  return {
    transKey: raw.slice(0, sep),
    subKey: raw.slice(sep + 1),
  };
}

export function formatProductKey(transKey, subKey) {
  return `${transKey ?? ""}${KEY_SEPARATOR}${subKey ?? ""}`;
}

function isValidSubKey(key) {
  if (!key || key.length !== PRINTABLE_RANGE) return false;
  const seen = new Set();
  for (const ch of key) {
    const code = ch.charCodeAt(0);
    if (code < PRINTABLE_START || code > PRINTABLE_END) return false;
    if (seen.has(ch)) return false;
    seen.add(ch);
  }
  return true;
}

function substituteWithKey(text, subKey) {
  if (!isValidSubKey(subKey)) return text;
  let out = "";
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code >= PRINTABLE_START && code <= PRINTABLE_END) {
      out += subKey[code - PRINTABLE_START];
    } else {
      out += ch;
    }
  }
  return out;
}

function invertSubKey(subKey) {
  // subKey[i] is the cipher char for plaintext char (PRINTABLE_START + i).
  // Inverse: for each cipher char c, find which plaintext index produced it.
  const inverse = new Array(PRINTABLE_RANGE);
  for (let i = 0; i < PRINTABLE_RANGE; i++) {
    const code = subKey.charCodeAt(i);
    inverse[code - PRINTABLE_START] = String.fromCharCode(PRINTABLE_START + i);
  }
  return inverse.join("");
}

export function productEncrypt(text, transKey, subKey) {
  const transposed = columnarEncrypt(text ?? "", transKey ?? "");
  return substituteWithKey(transposed, subKey ?? "");
}

export function productDecrypt(text, transKey, subKey) {
  if (!isValidSubKey(subKey)) {
    // Without a valid subKey we can still unwind the transposition layer
    // (encryption would have been a no-op for substitution).
    return columnarDecrypt(text ?? "", transKey ?? "");
  }
  const unSubstituted = substituteWithKey(text ?? "", invertSubKey(subKey));
  return columnarDecrypt(unSubstituted, transKey ?? "");
}
