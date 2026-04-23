// solver.js — Cipher solver algorithm foundation
// Pure functions only, no DOM dependencies.

// ---------------------------------------------------------------------------
// Step 1: English frequency table
// ---------------------------------------------------------------------------

const PRINTABLE_START = 32;   // space
const PRINTABLE_END   = 126;  // tilde
const PRINTABLE_RANGE = 95;   // number of printable ASCII characters
const FREQ_FLOOR      = 0.0001;

// Approximate English character frequencies (single characters).
// Source: standard letter-frequency tables plus punctuation estimates.
const ENGLISH_FREQ_MAP = {
  ' ': 0.1831,
  'e': 0.1026,
  't': 0.0751,
  'a': 0.0654,
  'o': 0.0600,
  'i': 0.0566,
  'n': 0.0566,
  's': 0.0531,
  'r': 0.0498,
  'h': 0.0468,
  'l': 0.0331,
  'd': 0.0328,
  'u': 0.0228,
  'c': 0.0223,
  'm': 0.0203,
  'f': 0.0198,
  'w': 0.0170,
  'g': 0.0162,
  'y': 0.0143,
  'p': 0.0137,
  'b': 0.0123,
  'v': 0.0080,
  'k': 0.0056,
  "'": 0.0040,
  'j': 0.0010,
  'x': 0.0009,
  'q': 0.0008,
  'z': 0.0007,
  '.': 0.0065,
  ',': 0.0061,
  '"': 0.0030,
  '-': 0.0020,
  '!': 0.0012,
  '?': 0.0010,
  ';': 0.0006,
  ':': 0.0006,
  '(': 0.0004,
  ')': 0.0004,
  '0': 0.0009,
  '1': 0.0008,
  '2': 0.0006,
  '3': 0.0004,
  '4': 0.0003,
  '5': 0.0003,
  '6': 0.0003,
  '7': 0.0003,
  '8': 0.0003,
  '9': 0.0003,
};

// Build ENGLISH_FREQ_ORDER: all 95 printable ASCII chars sorted by frequency
// (most frequent first). Chars not listed above use FREQ_FLOOR.
const ENGLISH_FREQ_ORDER = Array.from(
  { length: PRINTABLE_RANGE },
  (_, i) => String.fromCharCode(PRINTABLE_START + i)
).sort((a, b) => {
  const fa = ENGLISH_FREQ_MAP[a] ?? FREQ_FLOOR;
  const fb = ENGLISH_FREQ_MAP[b] ?? FREQ_FLOOR;
  return fb - fa; // descending
});

export { ENGLISH_FREQ_ORDER };

// ---------------------------------------------------------------------------
// Step 2: Bigram scoring
// ---------------------------------------------------------------------------

// Log10 probabilities for common English bigrams.
// Values derived from typical English bigram frequency tables.
const COMMON_BIGRAMS = {
  // Space-prefixed (word starters)
  ' t': -1.35,
  ' a': -1.40,
  ' o': -1.55,
  ' s': -1.58,
  ' i': -1.60,
  ' h': -1.62,
  ' w': -1.65,
  ' b': -1.70,
  ' c': -1.75,
  ' f': -1.78,
  ' m': -1.80,
  ' p': -1.85,
  ' d': -1.88,
  ' n': -1.92,
  ' r': -1.95,
  ' l': -2.00,
  ' e': -2.10,
  ' g': -2.20,
  ' y': -2.25,
  ' u': -2.30,
  // Space-suffixed (word enders)
  'e ': -1.30,
  't ': -1.45,
  's ': -1.50,
  'd ': -1.55,
  'n ': -1.60,
  'r ': -1.65,
  'y ': -1.70,
  'f ': -1.80,
  'g ': -1.85,
  'h ': -1.90,
  'l ': -1.95,
  'k ': -2.00,
  // Common letter pairs
  'th': -1.20,
  'he': -1.25,
  'in': -1.38,
  'er': -1.42,
  'an': -1.48,
  're': -1.52,
  'on': -1.56,
  'en': -1.60,
  'at': -1.63,
  'nd': -1.65,
  'st': -1.68,
  'es': -1.70,
  'ed': -1.72,
  'is': -1.74,
  'it': -1.76,
  'ng': -1.78,
  'ha': -1.80,
  'ou': -1.82,
  'or': -1.84,
  'ea': -1.86,
  'ti': -1.88,
  'to': -1.90,
  'io': -1.92,
  'le': -1.94,
  'al': -1.96,
  've': -1.98,
  'hi': -2.00,
  'ri': -2.02,
  'ro': -2.04,
  'li': -2.06,
  'nt': -2.08,
  'te': -2.10,
  'as': -2.12,
  'ar': -2.14,
  'om': -2.16,
  'me': -2.18,
  'de': -2.20,
  'se': -2.22,
  'la': -2.24,
  'si': -2.26,
  'ne': -2.28,
  'no': -2.30,
  'be': -2.32,
  'co': -2.34,
  'ma': -2.36,
  'di': -2.38,
  'fo': -2.40,
  'ra': -2.42,
  'ac': -2.44,
  'wi': -2.46,
  'il': -2.48,
  'wa': -2.50,
};

const BIGRAM_FLOOR = -6;

// Populate BIGRAM_LOG with lowercase, uppercase, and mixed-case variants.
const BIGRAM_LOG = {};

for (const [bigram, logProb] of Object.entries(COMMON_BIGRAMS)) {
  const lo = bigram.toLowerCase();
  const up = bigram.toUpperCase();
  const cap = bigram[0].toUpperCase() + bigram[1].toLowerCase();
  const uncap = bigram[0].toLowerCase() + bigram[1].toUpperCase();

  for (const variant of [lo, up, cap, uncap]) {
    // Only set if not already present (prefer earlier/more specific entry).
    if (!(variant in BIGRAM_LOG)) {
      BIGRAM_LOG[variant] = logProb;
    }
  }
}

/**
 * Score text by summing log10-probabilities of all adjacent character pairs.
 * Higher (less negative) scores indicate more English-like text.
 *
 * @param {string} text
 * @returns {number}
 */
function scoreBigrams(text) {
  let score = 0;
  for (let i = 0; i < text.length - 1; i++) {
    const pair = text[i] + text[i + 1];
    score += BIGRAM_LOG[pair] ?? BIGRAM_FLOOR;
  }
  return score;
}

export { scoreBigrams };

// ---------------------------------------------------------------------------
// Step 3: Mapping functions
// ---------------------------------------------------------------------------

/**
 * Count frequencies of printable ASCII characters in text.
 *
 * @param {string} text
 * @returns {Object.<string, number>} Map of char -> count
 */
function countFrequencies(text) {
  const counts = {};
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code >= PRINTABLE_START && code <= PRINTABLE_END) {
      counts[ch] = (counts[ch] ?? 0) + 1;
    }
  }
  return counts;
}

/**
 * Build an initial cipher->plaintext mapping by matching cipher character
 * frequencies to English frequency order (most frequent cipher char maps to
 * most frequent English char, etc.).
 *
 * @param {string} ciphertext
 * @returns {Object.<string, string>} Map of cipherChar -> plainChar
 */
function buildInitialMapping(ciphertext) {
  const counts = countFrequencies(ciphertext);

  // Sort cipher chars by descending frequency.
  const cipherByFreq = Object.keys(counts).sort(
    (a, b) => counts[b] - counts[a]
  );

  const mapping = {};
  for (let i = 0; i < cipherByFreq.length; i++) {
    const cipherChar = cipherByFreq[i];
    const plainChar  = ENGLISH_FREQ_ORDER[i] ?? cipherChar;
    mapping[cipherChar] = plainChar;
  }
  return mapping;
}

/**
 * Apply a char->char mapping to the ciphertext, returning a decoded string.
 * Characters not present in the mapping are passed through unchanged.
 *
 * @param {string} ciphertext
 * @param {Object.<string, string>} mapping
 * @returns {string}
 */
function applyMapping(ciphertext, mapping) {
  let result = '';
  for (const ch of ciphertext) {
    result += mapping[ch] ?? ch;
  }
  return result;
}

export { countFrequencies, buildInitialMapping, applyMapping };

// ---------------------------------------------------------------------------
// Step 4: Caesar detection
// ---------------------------------------------------------------------------

/**
 * Check whether all entries in a mapping share a single Caesar shift value
 * (modulo PRINTABLE_RANGE over the printable ASCII block).
 *
 * @param {Object.<string, string>} mapping
 * @returns {number|null} The shift if consistent, null otherwise.
 */
function detectCaesar(mapping) {
  const entries = Object.entries(mapping);
  if (entries.length === 0) return null;

  let expectedShift = null;

  for (const [cipherChar, plainChar] of entries) {
    const cipherCode = cipherChar.charCodeAt(0);
    const plainCode  = plainChar.charCodeAt(0);

    // Only consider printable ASCII characters.
    if (
      cipherCode < PRINTABLE_START || cipherCode > PRINTABLE_END ||
      plainCode  < PRINTABLE_START || plainCode  > PRINTABLE_END
    ) {
      return null;
    }

    // shift = (cipherCode - plainCode + PRINTABLE_RANGE) % PRINTABLE_RANGE
    // This represents how many positions were added during encryption.
    const shift = ((cipherCode - plainCode) % PRINTABLE_RANGE + PRINTABLE_RANGE) % PRINTABLE_RANGE;

    if (expectedShift === null) {
      expectedShift = shift;
    } else if (shift !== expectedShift) {
      return null;
    }
  }

  return expectedShift;
}

export { detectCaesar };

// ---------------------------------------------------------------------------
// Step 5: English span detection
// ---------------------------------------------------------------------------

// Common English bigrams and trigrams used to identify "English-like" spans.
const COMMON_ENGLISH = new Set([
  // Bigrams
  'th', 'he', 'in', 'er', 'an', 're', 'on', 'en', 'at', 'nd',
  'st', 'es', 'ed', 'is', 'it', 'ng', 'ha', 'ou', 'or', 'ea',
  'ti', 'to', 'io', 'le', 'al', 've', 'hi', 'ri', 'ro', 'li',
  'nt', 'te', 'as', 'ar', 'om', 'me', 'de', 'se',
  // Trigrams
  'the', 'and', 'ing', 'ion', 'tio', 'ent', 'ati', 'for', 'her',
  'ter', 'hat', 'tha', 'ere', 'con', 'res', 'ver', 'all', 'ons',
  'nce', 'men', 'ith', 'ted', 'ers', 'pro', 'thi', 'wit',
]);

/**
 * Return a boolean array, same length as text, where true means the character
 * at that position is part of a recognized English bigram or trigram
 * (case-insensitive check).
 *
 * @param {string} text
 * @returns {boolean[]}
 */
function findEnglishSpans(text) {
  const lower = text.toLowerCase();
  const spans = new Array(text.length).fill(false);

  for (let i = 0; i < lower.length; i++) {
    // Check trigram starting at i.
    if (i + 2 < lower.length) {
      const tri = lower.slice(i, i + 3);
      if (COMMON_ENGLISH.has(tri)) {
        spans[i]     = true;
        spans[i + 1] = true;
        spans[i + 2] = true;
      }
    }
    // Check bigram starting at i.
    if (i + 1 < lower.length) {
      const bi = lower.slice(i, i + 2);
      if (COMMON_ENGLISH.has(bi)) {
        spans[i]     = true;
        spans[i + 1] = true;
      }
    }
  }

  return spans;
}

export { findEnglishSpans };

// ---------------------------------------------------------------------------
// Step 6: Hill climbing solver iterator
// ---------------------------------------------------------------------------

/**
 * Generator that performs hill-climbing substitution cipher solving.
 * Yields step-by-step state so the UI can animate each iteration.
 *
 * Yield phases:
 *   MAPPING  — initial frequency-based mapping (once, at start)
 *   REFINING — each hill-climbing swap attempt
 *   SOLVED   — final state after convergence or iteration limit
 *
 * @param {string} ciphertext
 * @yields {{ phase: string, mapping: Object, score: number, decoded: string,
 *            accepted: boolean|null, swappedPair: [string,string]|null,
 *            iteration?: number, caesar?: boolean, shift?: number }}
 */
function* createSolverIterator(ciphertext) {
  // --- Step 1: Build initial mapping ---
  const mapping = buildInitialMapping(ciphertext);
  let decoded = applyMapping(ciphertext, mapping);
  let currentScore = scoreBigrams(decoded);

  // Yield initial MAPPING state.
  yield {
    phase: 'MAPPING',
    mapping: { ...mapping },
    score: currentScore,
    decoded,
    accepted: null,
    swappedPair: null,
  };

  // --- Step 2: Caesar check ---
  const shift = detectCaesar(mapping);
  if (shift !== null) {
    yield {
      phase: 'SOLVED',
      mapping: { ...mapping },
      score: currentScore,
      decoded,
      accepted: null,
      swappedPair: null,
      caesar: true,
      shift,
    };
    return;
  }

  // --- Step 3: Hill climbing ---
  const MAX_NO_IMPROVE = 500;
  const MAX_ITERATIONS = 5000;

  const cipherChars = Object.keys(mapping);
  let noImproveCount = 0;
  let iteration = 0;

  while (noImproveCount < MAX_NO_IMPROVE && iteration < MAX_ITERATIONS) {
    iteration++;

    // Pick two distinct random cipher characters.
    const idxA = Math.floor(Math.random() * cipherChars.length);
    let idxB = Math.floor(Math.random() * (cipherChars.length - 1));
    if (idxB >= idxA) idxB++;

    const charA = cipherChars[idxA];
    const charB = cipherChars[idxB];

    // Swap their plaintext mappings.
    const tmp = mapping[charA];
    mapping[charA] = mapping[charB];
    mapping[charB] = tmp;

    const newDecoded = applyMapping(ciphertext, mapping);
    const newScore = scoreBigrams(newDecoded);

    let accepted;
    if (newScore >= currentScore) {
      // Keep the swap.
      currentScore = newScore;
      decoded = newDecoded;
      noImproveCount = 0;
      accepted = true;
    } else {
      // Revert the swap.
      mapping[charB] = mapping[charA];
      mapping[charA] = tmp;
      noImproveCount++;
      accepted = false;
    }

    yield {
      phase: 'REFINING',
      mapping: { ...mapping },
      score: currentScore,
      decoded,
      accepted,
      swappedPair: [charA, charB],
      iteration,
    };
  }

  // --- Step 4: Final SOLVED state ---
  yield {
    phase: 'SOLVED',
    mapping: { ...mapping },
    score: currentScore,
    decoded,
    accepted: null,
    swappedPair: null,
    caesar: false,
  };
}

export { createSolverIterator };
