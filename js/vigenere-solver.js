// vigenere-solver.js — Vigenère cipher solver
// Pure functions only. No DOM. Consumed by attack-panel.js as an iterator.

import { PRINTABLE_START, PRINTABLE_END, PRINTABLE_RANGE } from "./constants.js";
import {
  scoreText,
  findEnglishSpans,
} from "./solver.js";

const MAX_KEY_LENGTH_CAP = 12;
const MIN_TEXT_PER_COLUMN = 16;
const ENGLISH_COVERAGE_THRESHOLD = 0.25;
const REFINE_MAX_PASSES = 2;

export { MAX_KEY_LENGTH_CAP, ENGLISH_COVERAGE_THRESHOLD };

/**
 * Split ciphertext into K columns. Column k contains characters at positions
 * k, k+K, k+2K, ... — but only printable characters (codes 32–126). Non-
 * printable characters are skipped (they are also skipped by vigenereEncrypt).
 *
 * @param {string} ciphertext
 * @param {number} K
 * @returns {string[]} array of K column strings
 */
function columnsFor(ciphertext, K) {
  const columns = Array.from({ length: K }, () => "");
  let printableIndex = 0;
  for (const ch of ciphertext) {
    const code = ch.charCodeAt(0);
    if (code < PRINTABLE_START || code > PRINTABLE_END) continue;
    columns[printableIndex % K] += ch;
    printableIndex++;
  }
  return columns;
}

/**
 * Index of Coincidence over the 95-char printable alphabet.
 * IoC = Σ n_i(n_i - 1) / N(N - 1).
 * Returns 0 for strings shorter than 2 characters.
 */
function indexOfCoincidence(text) {
  const counts = new Array(PRINTABLE_RANGE).fill(0);
  let N = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code < PRINTABLE_START || code > PRINTABLE_END) continue;
    counts[code - PRINTABLE_START]++;
    N++;
  }
  if (N < 2) return 0;
  let sum = 0;
  for (const n of counts) sum += n * (n - 1);
  return sum / (N * (N - 1));
}

/**
 * Average IoC across the K columns of ciphertext. Higher values suggest the
 * column is a Caesar-shifted English text (English IoC ≈ 0.065).
 */
function avgColumnIoC(ciphertext, K) {
  const cols = columnsFor(ciphertext, K);
  let total = 0;
  for (const col of cols) total += indexOfCoincidence(col);
  return total / K;
}

export { columnsFor, indexOfCoincidence, avgColumnIoC };

/**
 * Count printable characters in a string.
 */
function printableLength(text) {
  let n = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code >= PRINTABLE_START && code <= PRINTABLE_END) n++;
  }
  return n;
}

/**
 * Return divisors of n that are ≥ 2 and < n (excludes n itself and 1).
 * Used to mitigate the IoC "multiples problem" (true K=3 also lights up 6, 9).
 */
function divisorsBelow(n) {
  const out = [];
  for (let d = 2; d < n; d++) {
    if (n % d === 0) out.push(d);
  }
  return out;
}

/**
 * Given the ANALYZING sweep results, build the set of candidate key lengths
 * to fully decode. Always includes the top two by IoC plus divisors of the top.
 */
function buildCandidateLengths(iocBars) {
  if (iocBars.length === 0) return [];
  const ranked = [...iocBars].sort((a, b) => b.ioc - a.ioc);
  const top1 = ranked[0].length;
  const set = new Set([top1]);
  if (ranked.length > 1) set.add(ranked[1].length);
  for (const d of divisorsBelow(top1)) set.add(d);
  return [...set].sort((a, b) => a - b);
}

/**
 * Reconstruct plaintext from ciphertext and a shift-per-column key array.
 * Non-printable characters are passed through (mirrors vigenereEncrypt).
 * Key index advances only on printable characters, matching encrypt behavior.
 */
function decodeWithKey(ciphertext, keyShifts) {
  const K = keyShifts.length;
  let out = "";
  let printableIndex = 0;
  for (const ch of ciphertext) {
    const code = ch.charCodeAt(0);
    if (code < PRINTABLE_START || code > PRINTABLE_END) {
      out += ch;
      continue;
    }
    const shift = keyShifts[printableIndex % K];
    out += String.fromCharCode(
      ((code - PRINTABLE_START - shift + PRINTABLE_RANGE) % PRINTABLE_RANGE) + PRINTABLE_START
    );
    printableIndex++;
  }
  return out;
}

/**
 * Turn a shift value into its printable key character.
 */
function shiftToChar(shift) {
  return String.fromCharCode(PRINTABLE_START + shift);
}

export { decodeWithKey, shiftToChar };

// Full 95-char printable ASCII frequency table for English prose.
// Space is the most common character (~18%); letter frequencies are written
// on the lowercase slots. The scorer lower-cases the observed text before
// comparing, so uppercase slots just need a floor to avoid divide-by-zero.
// Source: Lewand (2000) for space + letters; punctuation estimated from corpora.
const PRINTABLE_FREQ = (() => {
  const table = new Array(PRINTABLE_RANGE).fill(0.00001);
  const entries = {
    " ": 0.1831,
    "e": 0.1027, "t": 0.0754, "a": 0.0654, "o": 0.0638, "i": 0.0566,
    "n": 0.0562, "s": 0.0514, "h": 0.0492, "r": 0.0484, "d": 0.0337,
    "l": 0.0322, "u": 0.0225, "c": 0.0223, "m": 0.0201, "f": 0.0175,
    "w": 0.0168, "g": 0.0162, "y": 0.0159, "p": 0.0151, "b": 0.0099,
    "v": 0.0079, "k": 0.0056, "x": 0.0013, "j": 0.0011, "q": 0.0008,
    "z": 0.0005,
    ",": 0.0100, ".": 0.0100,
  };
  for (const [ch, f] of Object.entries(entries)) {
    table[ch.charCodeAt(0) - PRINTABLE_START] = f;
  }
  // Normalize so the distribution sums to 1.0 — chi-squared requires this to
  // produce correctly-scaled expected counts.
  const sum = table.reduce((a, b) => a + b, 0);
  for (let i = 0; i < table.length; i++) table[i] /= sum;
  return table;
})();

/**
 * Shift every printable character in a column by -shift (decoding direction).
 */
function decodeColumn(column, shift) {
  let out = "";
  for (const ch of column) {
    const code = ch.charCodeAt(0);
    if (code < PRINTABLE_START || code > PRINTABLE_END) {
      out += ch;
      continue;
    }
    out += String.fromCharCode(
      ((code - PRINTABLE_START - shift + PRINTABLE_RANGE) % PRINTABLE_RANGE) + PRINTABLE_START
    );
  }
  return out;
}

/**
 * Negative chi-squared distance between the full 95-char printable-ASCII
 * distribution of `text` and English prose frequencies. Higher is more
 * English-like. Returns -Infinity for empty strings.
 *
 * Using all 95 characters (not just letters) is essential for 95-char Vigenère:
 * each column contains spaces, punctuation, and digits from the plaintext, so
 * a letter-only scorer cannot reliably distinguish the correct shift.
 */
function scoreColumnEnglishness(text) {
  // Site plaintexts are all uppercase, but frequencies are keyed on lowercase.
  // Lower-case the observed text so A-Z and a-z both hit the same slot.
  const lower = text.toLowerCase();
  const counts = new Array(PRINTABLE_RANGE).fill(0);
  let total = 0;
  for (const ch of lower) {
    const code = ch.charCodeAt(0);
    if (code >= PRINTABLE_START && code <= PRINTABLE_END) {
      counts[code - PRINTABLE_START]++;
      total++;
    }
  }
  if (total === 0) return -Infinity;

  let chi = 0;
  for (let i = 0; i < PRINTABLE_RANGE; i++) {
    const expected = PRINTABLE_FREQ[i] * total;
    const observed = counts[i];
    chi += (observed - expected) ** 2 / expected;
  }
  return -chi;
}

/**
 * Brute-force all 95 shifts on `column` and return the one whose decoded output
 * best matches English prose character frequencies (full 95-char chi-squared).
 */
/**
 * Fraction of character positions that are part of a recognized English
 * bigram or trigram (via findEnglishSpans). Used as a threshold-free-ish
 * confidence signal for SOLVED vs. FAILED classification.
 */
function englishCoverage(text) {
  if (text.length === 0) return 0;
  const spans = findEnglishSpans(text);
  let hits = 0;
  for (const v of spans) if (v) hits++;
  return hits / spans.length;
}

export { englishCoverage };

function* createVigenereSolverIterator(ciphertext) {
  const N = printableLength(ciphertext);
  const K_max = Math.min(MAX_KEY_LENGTH_CAP, Math.floor(N / MIN_TEXT_PER_COLUMN));

  if (K_max < 2) {
    yield {
      phase: "FAILED",
      score: 0,
      decoded: ciphertext,
      iteration: 0,
      totalIterations: 0,
      iocBars: [],
      key: [],
    };
    return;
  }

  // Phase A — ANALYZING (IoC sweep)
  const iocBars = [];
  for (let K = 1; K <= K_max; K++) {
    const ioc = avgColumnIoC(ciphertext, K);
    iocBars.push({ length: K, ioc, status: "candidate" });
    yield {
      phase: "ANALYZING",
      score: 0,
      decoded: "",
      iteration: K,
      totalIterations: K_max,
      iocBars: iocBars.map((b) => ({ ...b })),
      key: [],
    };
  }

  // Phase B — DECODING (per-column Caesar on each candidate key length)
  const candidates = buildCandidateLengths(iocBars);
  const totalDecodeIterations = candidates.reduce((sum, K) => sum + K * PRINTABLE_RANGE, 0);
  let decodingIter = 0;
  let best = null; // { K, key, decoded, score }

  for (const K of candidates) {
    const cols = columnsFor(ciphertext, K);
    const shifts = [];
    for (let c = 0; c < K; c++) {
      let bestShift = 0;
      let bestColumnScore = -Infinity;
      for (let shift = 0; shift < PRINTABLE_RANGE; shift++) {
        const columnScore = scoreColumnEnglishness(decodeColumn(cols[c], shift));
        const accepted = columnScore > bestColumnScore;
        if (columnScore > bestColumnScore) {
          bestColumnScore = columnScore;
          bestShift = shift;
        }

        const trialKey = shifts
          .concat([shift])
          .concat(new Array(K - shifts.length - 1).fill(0));
        const partialDecoded = decodeWithKey(ciphertext, trialKey);
        decodingIter++;

        yield {
          phase: "DECODING",
          score: columnScore,
          decoded: partialDecoded,
          iteration: decodingIter,
          totalIterations: totalDecodeIterations,
          iocBars: iocBars.map((b) => ({
            ...b,
            status: b.length === K ? "computing" : b.status,
          })),
          key: shifts
            .concat([shift])
            .concat(new Array(K - shifts.length - 1).fill(null))
            .map((s) => (s === null ? null : shiftToChar(s))),
          accepted,
        };
      }
      shifts.push(bestShift);
    }

    const decoded = decodeWithKey(ciphertext, shifts);
    const score = scoreText(decoded);
    if (!best || score > best.score) {
      best = { K, key: shifts, decoded, score };
    }
  }

  if (!best) {
    yield {
      phase: "FAILED",
      score: 0,
      decoded: ciphertext,
      iteration: decodingIter,
      totalIterations: totalDecodeIterations,
      iocBars: iocBars.map((b) => ({ ...b, status: "rejected" })),
      key: [],
    };
    return;
  }

  // Phase C — REFINING (try shift ± 1 per column, accept if it raises score)
  const refineTotal = REFINE_MAX_PASSES * best.K * 2;
  let refineIter = 0;
  let currentKey = best.key.slice();
  let currentDecoded = best.decoded;
  let currentScore = best.score;

  for (let pass = 0; pass < REFINE_MAX_PASSES; pass++) {
    let changedThisPass = false;

    for (let c = 0; c < best.K; c++) {
      for (const delta of [-1, 1]) {
        refineIter++;
        const trialKey = currentKey.slice();
        trialKey[c] = ((trialKey[c] + delta) % PRINTABLE_RANGE + PRINTABLE_RANGE) % PRINTABLE_RANGE;
        const trialDecoded = decodeWithKey(ciphertext, trialKey);
        const trialScore = scoreText(trialDecoded);
        const accepted = trialScore > currentScore;

        if (accepted) {
          currentKey = trialKey;
          currentDecoded = trialDecoded;
          currentScore = trialScore;
          changedThisPass = true;
        }

        yield {
          phase: "REFINING",
          score: currentScore,
          decoded: currentDecoded,
          iteration: refineIter,
          totalIterations: refineTotal,
          iocBars: iocBars.map((b) => ({
            ...b,
            status: b.length === best.K ? "winner" : "rejected",
          })),
          key: currentKey.map(shiftToChar),
          accepted,
        };
      }
    }

    if (!changedThisPass) break;
  }

  // Phase D — terminal: classify SOLVED vs. FAILED by English coverage
  const coverage = englishCoverage(currentDecoded);
  const terminalPhase = coverage >= ENGLISH_COVERAGE_THRESHOLD ? "SOLVED" : "FAILED";

  yield {
    phase: terminalPhase,
    score: currentScore,
    decoded: currentDecoded,
    iteration: refineIter,
    totalIterations: refineTotal,
    iocBars: iocBars.map((b) => ({
      ...b,
      status: b.length === best.K ? "winner" : "rejected",
    })),
    key: currentKey.map(shiftToChar),
  };
}

export { createVigenereSolverIterator };
