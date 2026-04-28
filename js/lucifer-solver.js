// Mini-Lucifer differential-cryptanalysis solver.
//
// The attack is *chosen-plaintext*: the solver simulates an oracle by calling
// luciferEncryptBlock with the user's master key. The point of the demo is to
// show that even with the oracle, the cipher leaks more than it should --
// the S-box's biased difference distribution makes the round-4 key fall out
// after a few thousand pairs, and the remaining 8 master-key bits then yield
// to a tiny brute-force step.
//
// Strategy:
//
//   1. ANALYZING -- compute the DDT of the S-box; pin the 3-round
//      characteristic ΔP=(0x20,0x0B) → (ΔL_3,ΔR_3)=(0x0B,0x20) at p=1/4.
//
//   2. SAMPLING -- generate N chosen-plaintext pairs through the oracle.
//
//   3. VOTING -- for each candidate K_4 ∈ [0,256), partially decrypt round 4
//      and count pairs whose inferred ΔL_3 matches the characteristic.
//
//   4. PEELING -- recovered K_4 fixes 8 bits of the master key (bits 0..3 and
//      bits 12..15, by the schedule). The other 8 bits are bits 4..11. Try
//      all 256, score each decryption of the user's ciphertext with the
//      English n-gram scorer, pick the winner.
//
//   5. SOLVED / FAILED.

import {
  LUCIFER_SBOX,
  luciferEncryptBlock,
  luciferDecrypt,
} from "./lucifer.js";
import { englishCoverage } from "./vigenere-solver.js";

// Differential characteristic constants. ΔR_3 = 0x20 has its low nibble at
// zero, so the low-nibble S-box in round 4 takes input-difference 0
// (deterministic). That means the *low* nibble of K_4 is invisible to the
// test -- only K_4's *high* nibble (= master bits 0..3) is actually
// distinguished by the votes. The remaining 12 master bits get brute-forced.
const INPUT_DIFF = 0x200b;        // (ΔL_0, ΔR_0)
const EXPECTED_DL3 = 0x0b;        // predicted ΔL_3 after 3 rounds
const EXPECTED_DR3 = 0x20;        // predicted ΔR_3 after 3 rounds

const DEFAULT_PAIRS = 5000;
const SAMPLING_BATCH = 256;       // pairs per yield during SAMPLING
const VOTE_BATCH = 8;             // K_4 candidates per yield during VOTING
const PEEL_BATCH = 64;            // brute-force tries per yield during PEELING

// How many top K_4-hi-nibble candidates to peel-and-score against the user's
// ciphertext. The differential normally gives a clear winner, but at low pair
// counts (or pathological keys) the runner-up can edge out -- 3 is cheap.
const TOP_HI_NIBBLES = 3;

// SOLVED uses two signals: a high printable-ASCII fraction (correct
// decryption is always 100% printable; wrong keys leak ~50% non-printable
// bytes) plus a modest English-coverage floor to rule out the rare wrong-key
// decryption that happens to land in printable space by chance.
const SOLVED_PRINTABLE_THRESHOLD = 0.95;
const SOLVED_COVERAGE_THRESHOLD = 0.15;

// ---------- F-function (mirrors lucifer.js) ----------

function F(rByte, roundKey) {
  const x = (rByte ^ roundKey) & 0xff;
  const hi = LUCIFER_SBOX[(x >>> 4) & 0xf];
  const lo = LUCIFER_SBOX[x & 0xf];
  return ((lo << 4) | hi) & 0xff;
}

// Combined fitness for a candidate decryption. The user's plaintext is
// printable ASCII, so any byte outside 0x20..0x7E is a strong signal of a
// wrong key. We weight English bigram/trigram coverage by the printable-byte
// fraction so wrong keys -- which produce roughly half non-printable bytes --
// can't sneak ahead via stray single-letter "words" picked up by the
// generic English scorer.
function fitness(decoded) {
  if (!decoded) return 0;
  let printable = 0;
  for (let i = 0; i < decoded.length; i++) {
    const c = decoded.charCodeAt(i);
    if (c >= 0x20 && c <= 0x7e) printable++;
  }
  const printableFrac = printable / decoded.length;
  return englishCoverage(decoded) * printableFrac;
}

// ---------- DDT ----------

export function computeDDT(sbox) {
  // 16x16 table; ddt[Δin][Δout] = count of x in [0,16) with S(x)⊕S(x⊕Δin) = Δout.
  const ddt = Array.from({ length: 16 }, () => new Uint8Array(16));
  for (let din = 0; din < 16; din++) {
    for (let x = 0; x < 16; x++) {
      const dout = sbox[x] ^ sbox[x ^ din];
      ddt[din][dout]++;
    }
  }
  return ddt;
}

// ---------- master-key reconstruction ----------

// Mapping from K_4 to master-key bits, derived from the rotating-window
// schedule:
//   master bits 0..3   = K_4 high nibble (K_4 bits 4..7)
//   master bits 12..15 = K_4 low  nibble (K_4 bits 0..3)
// The differential only constrains K_4's HIGH nibble (see header comment), so
// the recoverable piece is master bits 0..3. The other 12 master bits get
// brute-forced.
function masterFromK4HiAndUpper(k4Hi, upper12) {
  // upper12 occupies master bits 4..15 (12 bits), k4Hi (4 bits) goes into
  // master bits 0..3.
  return ((upper12 & 0xfff) << 4 | (k4Hi & 0xf)) & 0xffff;
}

// ---------- solver iterator ----------

export function* createLuciferSolverIterator(ciphertext, options = {}) {
  const masterKey = options.masterKey;
  const numPairs = options.numPairs ?? DEFAULT_PAIRS;

  if (typeof masterKey !== "number" || (masterKey & 0xffff) !== masterKey) {
    yield {
      phase: "FAILED",
      reason: "missing-oracle-key",
      decoded: ciphertext,
      score: -Infinity,
      iteration: 0,
      totalIterations: 0,
    };
    return;
  }

  const totalIterations = numPairs + 256 + TOP_HI_NIBBLES * 4096;
  let iteration = 0;

  // ---- 1. ANALYZING: build DDT, surface the chosen characteristic ----

  const ddt = computeDDT(LUCIFER_SBOX);

  yield {
    phase: "ANALYZING",
    subPhase: "DDT",
    ddt,
    inputDiff: INPUT_DIFF,
    expectedDL3: EXPECTED_DL3,
    expectedDR3: EXPECTED_DR3,
    decoded: ciphertext,
    score: -Infinity,
    iteration,
    totalIterations,
    votes: null,
    bestK4: null,
    masterKey: null,
  };

  // ---- 2. SAMPLING: chosen-plaintext pairs through the oracle ----

  const pairs = new Array(numPairs);
  for (let i = 0; i < numPairs; i++) {
    const p1 = Math.floor(Math.random() * 0x10000) & 0xffff;
    const p2 = (p1 ^ INPUT_DIFF) & 0xffff;
    const c1 = luciferEncryptBlock(p1, masterKey);
    const c2 = luciferEncryptBlock(p2, masterKey);
    pairs[i] = { c1, c2 };
    iteration++;

    if ((i + 1) % SAMPLING_BATCH === 0 || i === numPairs - 1) {
      yield {
        phase: "SAMPLING",
        ddt,
        pairsCollected: i + 1,
        totalPairs: numPairs,
        decoded: ciphertext,
        score: -Infinity,
        iteration,
        totalIterations,
        votes: null,
        bestK4: null,
      };
    }
  }

  // ---- 3. VOTING: count ΔL_3 == 0x0B per K_4 candidate ----

  const votes = new Int32Array(256);
  for (let k4 = 0; k4 < 256; k4++) {
    let v = 0;
    for (let i = 0; i < numPairs; i++) {
      const { c1, c2 } = pairs[i];
      const cHi1 = (c1 >>> 8) & 0xff;
      const cLo1 = c1 & 0xff;
      const cHi2 = (c2 >>> 8) & 0xff;
      const cLo2 = c2 & 0xff;
      const l3a = cHi1 ^ F(cLo1, k4);
      const l3b = cHi2 ^ F(cLo2, k4);
      if ((l3a ^ l3b) === EXPECTED_DL3) v++;
    }
    votes[k4] = v;
    iteration++;

    if ((k4 + 1) % VOTE_BATCH === 0 || k4 === 255) {
      let leader = 0;
      for (let j = 1; j <= k4; j++) if (votes[j] > votes[leader]) leader = j;
      yield {
        phase: "VOTING",
        ddt,
        votes: Array.from(votes),
        votedSoFar: k4 + 1,
        bestK4: leader,
        bestVotes: votes[leader],
        decoded: ciphertext,
        score: -Infinity,
        iteration,
        totalIterations,
      };
    }
  }

  // ---- 4. PEELING: aggregate votes by K_4 HI nibble, brute-force 12 bits ----

  // The LO nibble of K_4 is unconstrained, so collapse votes onto the 16 HI
  // nibbles (sum across the 16 LO values) and rank those.
  const hiVotes = new Int32Array(16);
  for (let k4 = 0; k4 < 256; k4++) hiVotes[(k4 >>> 4) & 0xf] += votes[k4];
  const rankedHi = Array.from(hiVotes, (v, hi) => ({ hi, v }))
    .sort((a, b) => b.v - a.v)
    .slice(0, TOP_HI_NIBBLES);

  let best = { score: -Infinity, masterKey: null, decoded: ciphertext, k4Hi: null };

  for (let r = 0; r < rankedHi.length; r++) {
    const { hi } = rankedHi[r];
    let lastDecoded = best.decoded;
    let lastTryKey = null;
    for (let upper = 0; upper < 4096; upper++) {
      const mk = masterFromK4HiAndUpper(hi, upper);
      const decoded = luciferDecrypt(ciphertext, mk.toString(16).padStart(4, "0"));
      const score = fitness(decoded);
      if (score > best.score) {
        best = { score, masterKey: mk, decoded, k4Hi: hi };
      }
      iteration++;
      lastDecoded = decoded;
      lastTryKey = mk;

      if ((upper + 1) % PEEL_BATCH === 0 || upper === 4095) {
        yield {
          phase: "PEELING",
          ddt,
          votes: Array.from(votes),
          hiVotes: Array.from(hiVotes),
          bestK4: best.k4Hi === null ? null : (best.k4Hi << 4),
          candidateRank: r + 1,
          candidateHiNibble: hi,
          peelProgress: upper + 1,
          peelTotal: 4096,
          currentTryKey: lastTryKey,
          // Show the live brute-force attempt in the grid so the user actually
          // sees the search churning. The final SOLVED yield restores best.
          decoded: lastDecoded,
          bestDecoded: best.decoded,
          score: best.score,
          iteration,
          totalIterations,
          masterKey: best.masterKey,
        };
      }
    }
  }

  // ---- 5. SOLVED / FAILED ----

  const decoded = best.decoded ?? "";
  let printable = 0;
  for (let i = 0; i < decoded.length; i++) {
    const c = decoded.charCodeAt(i);
    if (c >= 0x20 && c <= 0x7e) printable++;
  }
  const printableFrac = decoded.length === 0 ? 0 : printable / decoded.length;
  const coverage = englishCoverage(decoded);
  const finalPhase =
    printableFrac >= SOLVED_PRINTABLE_THRESHOLD &&
    coverage >= SOLVED_COVERAGE_THRESHOLD
      ? "SOLVED"
      : "FAILED";
  yield {
    phase: finalPhase,
    ddt,
    votes: Array.from(votes),
    hiVotes: Array.from(hiVotes),
    bestK4: best.k4Hi === null ? null : (best.k4Hi << 4),
    decoded: best.decoded,
    score: best.score,
    coverage,
    iteration: totalIterations,
    totalIterations,
    masterKey: best.masterKey,
    recoveredKey: best.masterKey === null
      ? null
      : best.masterKey.toString(16).padStart(4, "0"),
  };
}
