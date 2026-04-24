// vigenere-solver.js — Vigenère cipher solver
// Pure functions only. No DOM. Consumed by attack-panel.js as an iterator.

import { PRINTABLE_START, PRINTABLE_END, PRINTABLE_RANGE } from "./constants.js";
import {
  scoreText,
  scoreQuadgrams,
  findBestCaesarShift,
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
  const totalDecodeIterations = candidates.reduce((sum, K) => sum + K, 0);
  let decodingIter = 0;
  let best = null; // { K, key, decoded, score }

  for (const K of candidates) {
    const cols = columnsFor(ciphertext, K);
    const shifts = [];
    for (let c = 0; c < K; c++) {
      const result = findBestCaesarShift(cols[c], scoreQuadgrams);
      shifts.push(result.shift);
      const partialKey = shifts.concat(new Array(K - shifts.length).fill(null));
      const partialDecoded = decodeWithKey(ciphertext, shifts.concat(new Array(K - shifts.length).fill(0)));
      const partialScore = scoreText(partialDecoded);
      decodingIter++;

      yield {
        phase: "DECODING",
        score: partialScore,
        decoded: partialDecoded,
        iteration: decodingIter,
        totalIterations: totalDecodeIterations,
        iocBars: iocBars.map((b) => ({
          ...b,
          status: b.length === K ? "computing" : b.status,
        })),
        key: partialKey.map((s) => (s === null ? null : shiftToChar(s))),
      };
    }

    const decoded = decodeWithKey(ciphertext, shifts);
    const score = scoreText(decoded);
    if (!best || score > best.score) {
      best = { K, key: shifts, decoded, score };
    }
  }

  // Phase C — REFINING (added in Task 3). For now, emit a terminal step.
  const finalIocBars = iocBars.map((b) => ({
    ...b,
    status: best && b.length === best.K ? "winner" : "rejected",
  }));

  yield {
    phase: "FAILED",
    score: best ? best.score : 0,
    decoded: best ? best.decoded : ciphertext,
    iteration: decodingIter,
    totalIterations: totalDecodeIterations,
    iocBars: finalIocBars,
    key: best ? best.key.map(shiftToChar) : [],
  };
}

export { createVigenereSolverIterator };
