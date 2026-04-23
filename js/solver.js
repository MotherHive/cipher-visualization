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
// Step 2: N-gram scoring
// ---------------------------------------------------------------------------

const GENERATED_NGRAM_MODULE_PATH = "./generated-ngram-data.js";
const NGRAM_WEIGHTS = new Map([
  [1, 0.02],
  [2, 0.06],
  [3, 0.12],
  [4, 0.35],
  [5, 0.45],
]);

let scoringModel = null;
let scoringModelPromise = null;

// Lightweight fallback so the solver still works if the generated data module
// is missing. The first real Solve click upgrades this to the full 1–5 gram
// model built from gram_data/.
const FALLBACK_QUADGRAM_LOG = {
  that: -2.50, ther: -2.55, with: -2.60, tion: -2.63,
  here: -2.67, ould: -2.70, ight: -2.73, have: -2.76,
  hich: -2.80, whic: -2.83, this: -2.86, thin: -2.89,
  they: -2.92, atio: -2.95, ever: -2.98, from: -3.01,
  ough: -3.04, were: -3.07, hing: -3.10, ment: -3.13,
  ence: -3.16, ance: -3.19, them: -3.22, heir: -3.25,
  been: -3.28, said: -3.31, each: -3.34, ting: -3.37,
  ring: -3.40, ness: -3.43, some: -3.46, what: -3.49,
};

const FALLBACK_MONOGRAM_MAP = new Map(
  Object.entries(ENGLISH_FREQ_MAP)
    .filter(([ch]) => ch >= "a" && ch <= "z")
    .map(([ch, freq]) => [ch.toUpperCase(), Math.log10(freq)])
);

const FALLBACK_QUADGRAM_MAP = new Map(
  Object.entries(FALLBACK_QUADGRAM_LOG).map(([gram, score]) => [gram.toUpperCase(), score])
);

const FALLBACK_WORD_LOG = {
  THE: -1.05,
  OF: -1.30,
  AND: -1.32,
  TO: -1.35,
  A: -1.40,
  IN: -1.42,
  IS: -1.73,
  FOR: -1.78,
  THAT: -1.82,
  WAS: -1.84,
  WITH: -1.90,
  BUT: -2.10,
  ALL: -2.12,
  NOT: -2.14,
  THIS: -2.18,
  HAVE: -2.20,
  FROM: -2.22,
  THEY: -2.25,
  HIS: -2.28,
  WERE: -2.30,
  GLITTER: -3.20,
};

const FALLBACK_WORD_MAP = new Map(
  Object.entries(FALLBACK_WORD_LOG)
);

const FALLBACK_WORD_FLOOR = -8;
const COMMON_CONTRACTIONS = new Set([
  "AREN'T", "CAN'T", "COULDN'T", "DIDN'T", "DOESN'T", "DON'T", "HADN'T",
  "HASN'T", "HAVEN'T", "HE'D", "HE'LL", "HE'S", "HOW'S", "I'D", "I'LL",
  "I'M", "I'VE", "ISN'T", "IT'S", "LET'S", "MIGHTN'T", "MUSTN'T", "SHE'D",
  "SHE'LL", "SHE'S", "SHOULDN'T", "THAT'S", "THERE'S", "THEY'D", "THEY'LL",
  "THEY'RE", "THEY'VE", "WASN'T", "WE'D", "WE'LL", "WE'RE", "WE'VE", "WEREN'T",
  "WHAT'S", "WHERE'S", "WHO'S", "WHY'S", "WON'T", "WOULDN'T", "YOU'D", "YOU'LL",
  "YOU'RE", "YOU'VE",
]);
const COMMON_APOSTROPHE_SUFFIXES = new Set(["S", "D", "LL", "RE", "VE", "M"]);

function createFallbackScoringModel() {
  return {
    tables: [
      { n: 1, weight: NGRAM_WEIGHTS.get(1), floor: Math.log10(FREQ_FLOOR), entries: FALLBACK_MONOGRAM_MAP },
      { n: 4, weight: NGRAM_WEIGHTS.get(4), floor: -10, entries: FALLBACK_QUADGRAM_MAP },
    ],
    wordEntries: FALLBACK_WORD_MAP,
    wordFloor: FALLBACK_WORD_FLOOR,
  };
}

function hydrateScoringModel(tableSpecs, scoreScale = 1, wordScores = [], wordFloor = FALLBACK_WORD_FLOOR * scoreScale) {
  return {
    tables: tableSpecs
      .map((table) => ({
        n: table.n,
        weight: table.weight ?? NGRAM_WEIGHTS.get(table.n) ?? 0,
        floor: table.floor / scoreScale,
        entries: new Map(
          table.entries.map(([gram, score]) => [gram, score / scoreScale])
        ),
      }))
      .sort((a, b) => a.n - b.n),
    wordEntries: new Map(
      wordScores.map(([word, score]) => [word, score / scoreScale])
    ),
    wordFloor: wordFloor / scoreScale,
  };
}

function getScoringModel() {
  if (!scoringModel) {
    scoringModel = createFallbackScoringModel();
  }
  return scoringModel;
}

async function loadScoringData() {
  if (scoringModelPromise) return scoringModelPromise;

  scoringModelPromise = import(GENERATED_NGRAM_MODULE_PATH)
    .then((mod) => {
      const scoreScale = mod.GENERATED_NGRAM_SCORE_SCALE ?? 1;
      scoringModel = hydrateScoringModel(
        mod.GENERATED_NGRAM_TABLES ?? [],
        scoreScale,
        mod.GENERATED_WORD_SCORES ?? [],
        mod.GENERATED_WORD_FLOOR ?? FALLBACK_WORD_FLOOR * scoreScale
      );
      return scoringModel;
    })
    .catch(() => getScoringModel());

  return scoringModelPromise;
}

function normalizeLetters(text) {
  return text.toUpperCase().replace(/[^A-Z]/g, "");
}

function scoreGramWindows(letters, table) {
  const windowCount = letters.length - table.n + 1;
  if (windowCount <= 0) return null;

  let total = 0;
  for (let i = 0; i < windowCount; i++) {
    const gram = letters.slice(i, i + table.n);
    total += table.entries.get(gram) ?? table.floor;
  }
  return total / windowCount;
}

function scoreWordStructure(text, model) {
  const words = text.toUpperCase().match(/[A-Z]+/g) ?? [];
  let score = 0;

  for (const word of words) {
    const exactScore = model.wordEntries.get(word);

    if (exactScore !== undefined) {
      const relativeScore = Math.max(0, exactScore - model.wordFloor);
      score += 1.5 + relativeScore * 1.35 + Math.min(word.length, 12) * 0.22;
      continue;
    }

    if (word.length === 1) {
      score += word === "A" || word === "I" ? 0.5 : -1.1;
      continue;
    }

    if (word.length === 2) {
      score -= 0.45;
      continue;
    }

    if (word.length === 3) {
      score -= 1.35;
      continue;
    }

    score -= 2.25 + Math.min(word.length - 4, 8) * 0.35;
  }

  return score;
}

function isLikelyContraction(token) {
  const normalized = token.toUpperCase();
  if (COMMON_CONTRACTIONS.has(normalized)) return true;

  const parts = normalized.split("'");
  if (parts.length !== 2) return false;

  const [head, tail] = parts;
  if (!head || !tail) return false;
  if (tail === "T") return head.endsWith("N");

  return COMMON_APOSTROPHE_SUFFIXES.has(tail);
}

function isLikelyHyphenatedWord(token, model) {
  const parts = token.toUpperCase().split("-");
  if (parts.length !== 2) return false;

  const [left, right] = parts;
  if (left.length < 2 || right.length < 2) return false;

  return (
    model.wordEntries.has(left) ||
    model.wordEntries.has(right) ||
    left.length + right.length >= 9
  );
}

function scoreReadableText(text, model) {
  let score = 0;

  const weirdInlinePunctuationMatches = text.match(/[A-Za-z][^A-Za-z\s'-][A-Za-z]/g) ?? [];
  score -= weirdInlinePunctuationMatches.length * 6.5;

  const punctuatedWordTokens = text.toUpperCase().match(/[A-Z]+(?:['-][A-Z]+)+/g) ?? [];
  for (const token of punctuatedWordTokens) {
    if (token.includes("'")) {
      if (isLikelyContraction(token)) score += 0.35;
      else score -= 9 + (token.match(/'/g) ?? []).length * 1.75;
    }

    if (token.includes("-")) {
      if (isLikelyHyphenatedWord(token, model)) score += 0.15;
      else score -= 4.5;
    }
  }

  const repeatedPunctuationMatches = text.match(/[^A-Za-z0-9\s]{2,}/g) ?? [];
  score -= repeatedPunctuationMatches.length * 2.5;

  const oddSingleLetterMatches = text.match(/\b(?!A\b|a\b|I\b|i\b)[A-Za-z]\b/g) ?? [];
  score -= oddSingleLetterMatches.length * 1.2;

  const vowelPoorWords = text.toUpperCase().match(/\b[BCDFGHJKLMNPQRSTVWXYZ]{4,}\b/g) ?? [];
  score -= vowelPoorWords.length * 2.75;

  const commonWordRuns = text.toUpperCase().match(/\b(THE|AND|THAT|WITH|HAVE|FROM|YOUR|HEARD|TOLD|MANY|LIFE|SOLD|OUTSIDE|BEHOLD)\b/g) ?? [];
  score += commonWordRuns.length * 0.8;

  return score;
}

function scoreTextWithModel(text, model) {
  const letters = normalizeLetters(text);
  if (letters.length === 0) return -Infinity;

  let weightedScore = 0;
  let totalWeight = 0;

  for (const table of model.tables) {
    const score = scoreGramWindows(letters, table);
    if (score === null) continue;
    weightedScore += score * table.weight;
    totalWeight += table.weight;
  }

  if (totalWeight === 0) return -Infinity;

  // Scale back up by text length so the score still has a clear gradient.
  return (
    (weightedScore / totalWeight) * letters.length +
    scoreWordStructure(text, model) * 1.8 +
    scoreReadableText(text, model)
  );
}

function scoreText(text) {
  return scoreTextWithModel(text, getScoringModel());
}

// Common short English words for Caesar detection.
const COMMON_WORDS = new Set([
  'the', 'and', 'that', 'have', 'for', 'not', 'with', 'you', 'this',
  'but', 'his', 'from', 'they', 'been', 'one', 'had', 'was', 'her',
  'are', 'all', 'were', 'when', 'will', 'can', 'said', 'there',
  'each', 'which', 'their', 'time', 'she', 'them', 'some', 'would',
  'make', 'like', 'him', 'into', 'has', 'two', 'more', 'very',
  'what', 'know', 'just', 'than', 'who', 'its', 'over', 'also',
]);

/**
 * Score text for Caesar detection by counting recognized English words.
 * More robust than quadgrams for Caesar because it doesn't suffer from
 * length-dependent scoring artifacts.
 */
function scoreCaesarCandidate(text) {
  const words = text.toLowerCase().split(/[^a-z]+/).filter(w => w.length > 0);
  let hits = 0;
  for (const w of words) {
    if (COMMON_WORDS.has(w)) hits++;
  }
  return hits;
}

const scoreQuadgrams = scoreText;

export { loadScoringData, scoreText, scoreQuadgrams };

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

// Space + letters sorted by English frequency (most frequent first).
// We intentionally keep the core substitution search letter-first instead of
// spending many moves on punctuation. That makes the solver much less likely
// to invent apostrophes where a plain letter is clearly the better read.
const LETTERS_BY_FREQ = ' etaoinsrhldcumfwgypbvkjxqz'.split('');

/**
 * Build an initial cipher->plaintext mapping by matching cipher character
 * frequencies to English letter frequencies. Only maps characters that appear
 * with meaningful frequency — rare punctuation and digits are mapped to
 * themselves, keeping the hill climber focused on what matters.
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

  // Only frequency-match the top N characters (where N = letters + space).
  // The rest are noise — map them to themselves.
  const mapping = {};
  const numToMap = Math.min(cipherByFreq.length, LETTERS_BY_FREQ.length);

  for (let i = 0; i < numToMap; i++) {
    mapping[cipherByFreq[i]] = LETTERS_BY_FREQ[i];
  }
  for (let i = numToMap; i < cipherByFreq.length; i++) {
    mapping[cipherByFreq[i]] = cipherByFreq[i];
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
// Step 6: Solver iterator
// ---------------------------------------------------------------------------

function decodeCaesarShift(ciphertext, shift) {
  let decoded = '';
  for (const ch of ciphertext) {
    const code = ch.charCodeAt(0);
    if (code >= PRINTABLE_START && code <= PRINTABLE_END) {
      decoded += String.fromCharCode(
        ((code - PRINTABLE_START - shift + PRINTABLE_RANGE) % PRINTABLE_RANGE) + PRINTABLE_START
      );
    } else {
      decoded += ch;
    }
  }
  return decoded;
}

/**
 * Try all 95 Caesar shifts. Returns the best shift, its score, and whether
 * the best shift is statistically dominant (strong signal = likely Caesar).
 */
function findBestCaesarShift(ciphertext, scoreDecoded = scoreQuadgrams) {
  let bestShift = 0;
  let bestWordScore = -Infinity;
  let bestQuadScore = -Infinity;
  let bestDecoded = ciphertext;

  for (let shift = 0; shift < PRINTABLE_RANGE; shift++) {
    const decoded = decodeCaesarShift(ciphertext, shift);
    const wordScore = scoreCaesarCandidate(decoded);
    const quadScore = scoreDecoded(decoded);

    if (
      wordScore > bestWordScore ||
      (wordScore === bestWordScore && quadScore > bestQuadScore)
    ) {
      bestShift = shift;
      bestWordScore = wordScore;
      bestQuadScore = quadScore;
      bestDecoded = decoded;
    }
  }

  // A true Caesar cipher will produce multiple recognized English words.
  // Require at least 2 word hits for confidence.
  const dominant = bestWordScore >= 2;

  return {
    shift: bestShift,
    score: bestQuadScore,
    dominant,
    decoded: bestDecoded,
  };
}

/**
 * Build a mapping object from a Caesar shift value.
 */
function buildCaesarMapping(ciphertext, shift) {
  const counts = countFrequencies(ciphertext);
  const mapping = {};
  for (const ch of Object.keys(counts)) {
    const code = ch.charCodeAt(0);
    mapping[ch] = String.fromCharCode(
      ((code - PRINTABLE_START - shift + PRINTABLE_RANGE) % PRINTABLE_RANGE) + PRINTABLE_START
    );
  }
  return mapping;
}

function runGreedyPolish(ciphertext, startingMapping, cipherChars, scoreDecoded) {
  const mapping = { ...startingMapping };
  let decoded = applyMapping(ciphertext, mapping);
  let currentScore = scoreDecoded(decoded);
  const MAX_PASSES = 8;

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let bestSwap = null;

    for (let i = 0; i < cipherChars.length - 1; i++) {
      const charA = cipherChars[i];

      for (let j = i + 1; j < cipherChars.length; j++) {
        const charB = cipherChars[j];
        const tmp = mapping[charA];
        mapping[charA] = mapping[charB];
        mapping[charB] = tmp;

        const swappedDecoded = applyMapping(ciphertext, mapping);
        const swappedScore = scoreDecoded(swappedDecoded);

        if (!bestSwap || swappedScore > bestSwap.score) {
          bestSwap = {
            charA,
            charB,
            score: swappedScore,
            decoded: swappedDecoded,
          };
        }

        mapping[charB] = mapping[charA];
        mapping[charA] = tmp;
      }
    }

    if (!bestSwap || bestSwap.score <= currentScore) break;

    const tmp = mapping[bestSwap.charA];
    mapping[bestSwap.charA] = mapping[bestSwap.charB];
    mapping[bestSwap.charB] = tmp;
    decoded = bestSwap.decoded;
    currentScore = bestSwap.score;
  }

  return {
    mapping,
    decoded,
    score: currentScore,
  };
}

/**
 * Generator that solves Caesar and Substitution ciphers.
 *
 * Strategy:
 *   1. Brute-force all 95 Caesar shifts, pick the best.
 *   2. If one shift dominates all others, it's a Caesar cipher — yield SOLVED.
 *   3. Otherwise, run simulated annealing with stochastic restarts.
 *
 * @param {string} ciphertext
 */
function* createSolverIterator(ciphertext) {
  // Snapshot the scoring tables once so a background model upgrade cannot
  // change the solver's fitness landscape mid-run.
  const scoringModel = getScoringModel();
  const scoreDecoded = (text) => scoreTextWithModel(text, scoringModel);

  // --- Step 1: Caesar brute force ---
  let caesar = {
    shift: 0,
    score: -Infinity,
    dominant: false,
    decoded: ciphertext,
  };

  for (let shift = 0; shift < PRINTABLE_RANGE; shift++) {
    const decodedCandidate = decodeCaesarShift(ciphertext, shift);
    const wordScore = scoreCaesarCandidate(decodedCandidate);
    const quadScore = scoreDecoded(decodedCandidate);
    const isBetterCandidate =
      wordScore > scoreCaesarCandidate(caesar.decoded) ||
      (wordScore === scoreCaesarCandidate(caesar.decoded) && quadScore > caesar.score);

    if (isBetterCandidate) {
      caesar = {
        shift,
        score: quadScore,
        dominant: wordScore >= 2,
        decoded: decodedCandidate,
      };
    }

    yield {
      phase: 'ANALYZING',
      mapping: buildCaesarMapping(ciphertext, shift),
      score: quadScore,
      decoded: decodedCandidate,
      accepted: null,
      swappedPair: null,
      iteration: shift,
      shift,
      bestShift: caesar.shift,
    };
  }

  caesar = findBestCaesarShift(ciphertext, scoreDecoded);
  const caesarMapping = buildCaesarMapping(ciphertext, caesar.shift);
  const caesarDecoded = caesar.decoded;

  // --- Step 2: Frequency-based initial mapping ---
  const mapping = buildInitialMapping(ciphertext);
  let decoded = applyMapping(ciphertext, mapping);
  let currentScore = scoreDecoded(decoded);

  // If one Caesar shift dominates all others, it's a Caesar cipher
  if (caesar.dominant && caesar.shift !== 0) {
    yield {
      phase: 'MAPPING',
      mapping: { ...caesarMapping },
      score: caesar.score,
      decoded: caesarDecoded,
      accepted: null,
      swappedPair: null,
    };
    yield {
      phase: 'SOLVED',
      mapping: { ...caesarMapping },
      score: caesar.score,
      decoded: caesarDecoded,
      accepted: null,
      swappedPair: null,
      caesar: true,
      shift: caesar.shift,
    };
    return;
  }

  // Yield initial mapping state
  yield {
    phase: 'MAPPING',
    mapping: { ...mapping },
    score: currentScore,
    decoded,
    accepted: null,
    swappedPair: null,
  };

  // --- Step 3: Simulated annealing ---
  // Only swap the most frequent cipher characters (letters + space territory).
  // Rare punctuation/digits are noise — swapping them wastes iterations.
  const counts = countFrequencies(ciphertext);
  const cipherChars = Object.keys(counts)
    .sort((a, b) => counts[b] - counts[a])
    .slice(0, LETTERS_BY_FREQ.length);
  const ITERS_PER_ROUND = 12000;
  const NUM_ROUNDS = 24;
  const MAX_NO_IMPROVE = 4500;
  const T_START = 20;
  const T_MIN = 0.01;

  const initialMapping = { ...mapping };
  let bestScore = currentScore;
  let bestMapping = { ...mapping };
  let bestDecoded = decoded;
  let globalIteration = 0;

  for (let round = 0; round < NUM_ROUNDS; round++) {
    // Stochastic restarts: most rounds refine around the best-known mapping,
    // while some rounds jump back toward the original frequency guess to
    // explore very different regions of the search space.
    if (round > 0) {
      const broadRestart = round % 4 === 0;
      const sourceMapping = broadRestart ? initialMapping : bestMapping;

      for (const ch of cipherChars) mapping[ch] = sourceMapping[ch];

      const numShuffles = broadRestart
        ? 8 + Math.floor(Math.random() * 8)
        : 4 + Math.floor(Math.random() * 6);

      for (let s = 0; s < numShuffles; s++) {
        const a = cipherChars[Math.floor(Math.random() * cipherChars.length)];
        const b = cipherChars[Math.floor(Math.random() * cipherChars.length)];
        if (a !== b) {
          const t = mapping[a]; mapping[a] = mapping[b]; mapping[b] = t;
        }
      }
      decoded = applyMapping(ciphertext, mapping);
      currentScore = scoreDecoded(decoded);
    }

    let noImproveCount = 0;

    for (let i = 1; i <= ITERS_PER_ROUND; i++) {
      if (noImproveCount >= MAX_NO_IMPROVE) break;
      globalIteration++;

      // Exponential cooling within this round
      const temperature = T_START * Math.pow(T_MIN / T_START, i / ITERS_PER_ROUND);

      // Pick two distinct random cipher characters
      const idxA = Math.floor(Math.random() * cipherChars.length);
      let idxB = Math.floor(Math.random() * (cipherChars.length - 1));
      if (idxB >= idxA) idxB++;

      const charA = cipherChars[idxA];
      const charB = cipherChars[idxB];

      // Swap their plaintext mappings
      const tmp = mapping[charA];
      mapping[charA] = mapping[charB];
      mapping[charB] = tmp;

      const newDecoded = applyMapping(ciphertext, mapping);
      const newScore = scoreDecoded(newDecoded);
      const delta = newScore - currentScore;

      const accept = delta > 0 || Math.random() < Math.exp(delta / temperature);

      if (accept) {
        currentScore = newScore;
        decoded = newDecoded;

        if (currentScore > bestScore) {
          bestScore = currentScore;
          bestMapping = { ...mapping };
          bestDecoded = decoded;
          noImproveCount = 0;
        } else {
          noImproveCount++;
        }
      } else {
        mapping[charB] = mapping[charA];
        mapping[charA] = tmp;
        noImproveCount++;
      }

      yield {
        phase: 'REFINING',
        mapping: { ...mapping },
        score: currentScore,
        decoded,
        accepted: delta > 0,
        swappedPair: [charA, charB],
        iteration: globalIteration,
      };
    }
  }

  const polished = runGreedyPolish(ciphertext, bestMapping, cipherChars, scoreDecoded);
  if (polished.score > bestScore) {
    bestMapping = polished.mapping;
    bestDecoded = polished.decoded;
    bestScore = polished.score;
  }

  // Restore best mapping found across all rounds
  yield {
    phase: 'SOLVED',
    mapping: bestMapping,
    score: bestScore,
    decoded: bestDecoded,
    accepted: null,
    swappedPair: null,
    caesar: false,
  };
}

export { createSolverIterator };
