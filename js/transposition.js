// Columnar transposition.
//
// Encrypt: write the plaintext into rows of width `key.length`. Then read out
// the columns in the order given by the alphabetical rank of the key letters.
//
//   key = "ZEBRA"  →  rank order [4, 2, 1, 3, 0]   (A=0, B=1, E=2, R=3, Z=4)
//   plain = "HELLOTHERE"
//
//     Z E B R A
//     ---------
//     H E L L O
//     T H E R E
//
//   read column rank 0 (A): O E
//   read column rank 1 (B): L E
//   read column rank 2 (E): E H
//   read column rank 3 (R): L R
//   read column rank 4 (Z): H T
//   ciphertext = "OE" + "LE" + "EH" + "LR" + "HT" = "OELEEHLRHT"
//
// The last row may be partial. We do NOT pad — instead we track per-column
// heights so columnarDecrypt knows how many cells each column actually held.

/**
 * Build the read-out order from a key string.
 * Returns an array `order` where `order[rank] = sourceColumnIndex`.
 *
 * Stable: ties are broken by original position. So "AABC" → [0,1,2,3].
 */
export function keyToOrder(key) {
  const indexed = [];
  for (let i = 0; i < key.length; i++) {
    indexed.push({ ch: key.charCodeAt(i), i });
  }
  indexed.sort((a, b) => (a.ch - b.ch) || (a.i - b.i));
  return indexed.map((entry) => entry.i);
}

/**
 * Encrypt by columnar transposition.
 * Non-printable characters in the plaintext are NOT stripped — they participate
 * in the grid like any other character. The grid is row-major over the raw text.
 */
export function columnarEncrypt(text, key) {
  const t = text ?? "";
  const k = key ?? "";
  if (k.length < 2 || t.length === 0) return t;

  const width = k.length;
  const order = keyToOrder(k);
  const rows = Math.ceil(t.length / width);

  // Per-column height: full rows for cols < remainder cells in last row,
  // one less for cols >= remainder. A remainder of 0 means every column is full.
  const remainder = t.length % width;
  const colHeight = (col) => {
    if (remainder === 0) return rows;
    return col < remainder ? rows : rows - 1;
  };

  let out = "";
  for (const sourceCol of order) {
    const h = colHeight(sourceCol);
    for (let r = 0; r < h; r++) {
      out += t[r * width + sourceCol];
    }
  }
  return out;
}

/**
 * Decrypt by inverting the columnar transposition.
 *
 * The trick: the ciphertext is the concatenation of columns in `order`, but
 * each column may have a different length. So we must first compute every
 * column's height, then chunk the ciphertext accordingly, then re-interleave
 * row-major to recover the plaintext.
 */
export function columnarDecrypt(text, key) {
  const k = key ?? "";
  if (k.length < 2) return text ?? "";
  return columnarDecryptByOrder(text, k.length, keyToOrder(k));
}

/**
 * Decrypt by inverting a columnar transposition given an explicit (width, order).
 * Used by the product-cipher solver so it can swap column orderings without
 * re-deriving them from a synthetic key string.
 *
 * @param {string} text     ciphertext
 * @param {number} width    grid width (= number of columns)
 * @param {number[]} order  read-out permutation; order[rank] = sourceColumnIndex
 */
export function columnarDecryptByOrder(text, width, order) {
  const t = text ?? "";
  if (width < 2 || t.length === 0) return t;

  const rows = Math.ceil(t.length / width);
  const remainder = t.length % width;

  const colHeight = (col) => {
    if (remainder === 0) return rows;
    return col < remainder ? rows : rows - 1;
  };

  const columns = new Array(width);
  let cursor = 0;
  for (const sourceCol of order) {
    const h = colHeight(sourceCol);
    columns[sourceCol] = t.slice(cursor, cursor + h);
    cursor += h;
  }

  let out = "";
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < width; c++) {
      const col = columns[c];
      if (r < col.length) out += col[r];
    }
  }
  return out;
}
