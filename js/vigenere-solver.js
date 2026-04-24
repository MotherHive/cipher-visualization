// vigenere-solver.js — Vigenère cipher solver
// Pure functions only. No DOM. Consumed by attack-panel.js as an iterator.

import { PRINTABLE_START, PRINTABLE_END, PRINTABLE_RANGE } from "./constants.js";
import {
  scoreText,
  scoreQuadgrams,
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

  // Placeholder terminator — replaced in Task 2 once DECODING is implemented.
  yield {
    phase: "FAILED",
    score: 0,
    decoded: ciphertext,
    iteration: K_max,
    totalIterations: K_max,
    iocBars: iocBars.map((b) => ({ ...b })),
    key: [],
  };
}

export { createVigenereSolverIterator };
