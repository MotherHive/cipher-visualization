// product-solver.js — Attacker for Product cipher (transposition ∘ substitution).
//
// Two-phase strategy with phase-specific scoring:
//
//   1. ANALYZING / REFINING_TRANS — find the transposition (width + column
//      order). Score by **bigram entropy** of the un-transposed text. Why:
//      monoalphabetic substitution just relabels bigrams, so the *shape* of
//      the bigram distribution is invariant under substitution. Only fixing
//      the transposition can lower the bigram entropy (English bigrams are
//      heavily concentrated; scrambled text is closer to uniform). This means
//      the trans search is independent of substitution and converges sharply.
//
//   2. REFINING_SUBST — once the transposition is locked, the un-transposed
//      ciphertext is just a monoalphabetic substitution. Hill-climb the
//      mapping with simulated annealing + stochastic restarts using the full
//      n-gram scorer.
//
//   3. SOLVED / FAILED — classify by `englishCoverage`.
//
// Pure functions only; consumed as an iterator by attack-panel.js.

import {
  DEFAULT_ROUNDS,
  scoreText,
  buildInitialMapping,
  applyMapping,
  countFrequencies,
  createSolverIterator,
  solverTotalIterations,
} from "./solver.js";
import { englishCoverage } from "./vigenere-solver.js";
import { columnarDecryptByOrder } from "./transposition.js";

const MIN_WIDTH = 3;
const MAX_WIDTH_CAP = 6;
const TOP_TRANS_CANDIDATES = 4;

// ANALYZING: trans-only SA hill-climb per width, scored by bigram entropy.
const ANALYZING_TRANS_RESTARTS = 5;
const ANALYZING_TRANS_ITERS_PER_RESTART = 120;
const ANALYZING_YIELD_EVERY = 8;

// REFINING_TRANS: deeper trans polish on the picked width.
const REFINE_TRANS_RESTARTS = 6;
const REFINE_TRANS_ITERS_PER_RESTART = 200;

// SA temperatures for the trans search. The score is -bigramEntropy, so deltas
// between neighbouring permutations sit in roughly the [0.001, 0.5] range —
// hence a much smaller temperature scale than the substitution solver uses.
const TRANS_T_START = 0.15;
const TRANS_T_MIN = 0.001;

const ENGLISH_COVERAGE_THRESHOLD = 0.3;
const SOLVED_SCORE_MARGIN = 8;
const SOLVED_COVERAGE_MARGIN = 0.05;

// ---------- helpers ----------

function maxWidthFor(textLen) {
  return Math.min(MAX_WIDTH_CAP, Math.max(MIN_WIDTH, textLen));
}

function identityOrder(w) {
  const out = new Array(w);
  for (let i = 0; i < w; i++) out[i] = i;
  return out;
}

function shuffledOrder(w) {
  const a = identityOrder(w);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickTwo(n) {
  const a = Math.floor(Math.random() * n);
  let b = Math.floor(Math.random() * (n - 1));
  if (b >= a) b++;
  return [a, b];
}

// Generate a neighbouring permutation. Mixes single 2-swaps with segment
// reversals (a 2-opt move), which crosses ridges that pure 2-swaps cannot —
// the entropy landscape over column orders has flat plateaus where every
// 2-swap is a tie or a small loss but a block flip moves you across them.
function neighborOrder(order) {
  const W = order.length;
  if (W < 2) return order.slice();
  const out = order.slice();
  if (W === 2 || Math.random() < 0.6) {
    const [i, j] = pickTwo(W);
    [out[i], out[j]] = [out[j], out[i]];
    return out;
  }
  let [i, j] = pickTwo(W);
  if (i > j) [i, j] = [j, i];
  while (i < j) {
    [out[i], out[j]] = [out[j], out[i]];
    i++;
    j--;
  }
  return out;
}

function transTemperature(step, totalSteps) {
  if (totalSteps <= 1) return TRANS_T_MIN;
  return TRANS_T_START * Math.pow(TRANS_T_MIN / TRANS_T_START, step / totalSteps);
}

/**
 * Shannon entropy (bits) of the bigram distribution of `text`.
 *
 * Lower = more concentrated distribution = more English-like in shape. This
 * works for the trans search because:
 *   - Transposition rearranges char positions, breaking adjacency. The wrong
 *     un-transposition leaves bigrams scattered (high entropy).
 *   - Substitution relabels chars 1-to-1, which only renames bigrams without
 *     changing their frequency *shape*. So the same scrambled-vs-concentrated
 *     signal survives the substitution layer.
 */
function bigramEntropy(text) {
  const counts = new Map();
  let total = 0;
  for (let i = 0; i < text.length - 1; i++) {
    const bg = text.charCodeAt(i) * 256 + text.charCodeAt(i + 1);
    counts.set(bg, (counts.get(bg) || 0) + 1);
    total++;
  }
  if (total < 2) return Infinity;
  let H = 0;
  const inv = 1 / total;
  for (const c of counts.values()) {
    const p = c * inv;
    H -= p * Math.log2(p);
  }
  return H;
}

// Higher = better, for sparkline-friendly direction.
function transScore(half) {
  return -bigramEntropy(half);
}

function cloneWidthBars(widthBars) {
  return widthBars.map((bar) => ({ ...bar }));
}

function changedOrderPositions(before, after) {
  const changed = [];
  for (let i = 0; i < before.length; i++) {
    if (before[i] !== after[i]) changed.push(i);
  }
  if (changed.length === 0) return null;
  if (changed.length === 1) return [changed[0], changed[0]];
  return [changed[0], changed[changed.length - 1]];
}

function buildIdentityMapping(text) {
  const mapping = {};
  const counts = countFrequencies(text);
  for (const ch of Object.keys(counts)) {
    mapping[ch] = ch;
  }
  return mapping;
}

function makeDecodedCandidate({ decoded, mapping, width, order, score = scoreText(decoded) }) {
  return {
    decoded,
    mapping,
    width,
    order: order.slice(),
    score,
    coverage: englishCoverage(decoded),
  };
}

function compareDecodedCandidates(a, b) {
  const scoreA = Number.isFinite(a.score) ? a.score : -Infinity;
  const scoreB = Number.isFinite(b.score) ? b.score : -Infinity;
  if (scoreA !== scoreB) return scoreA - scoreB;
  return a.coverage - b.coverage;
}

function pickBetterCandidate(currentBest, nextCandidate) {
  if (!currentBest) return nextCandidate;
  return compareDecodedCandidates(nextCandidate, currentBest) > 0 ? nextCandidate : currentBest;
}

function findTopCandidates(candidates) {
  let best = null;
  let runnerUp = null;

  for (const candidate of candidates) {
    if (!best || compareDecodedCandidates(candidate, best) > 0) {
      runnerUp = best;
      best = candidate;
      continue;
    }
    if (!runnerUp || compareDecodedCandidates(candidate, runnerUp) > 0) {
      runnerUp = candidate;
    }
  }

  return { best, runnerUp };
}

function isConfidentSolved(bestCandidate, runnerUpCandidate) {
  if (!bestCandidate || bestCandidate.coverage < ENGLISH_COVERAGE_THRESHOLD) return false;
  if (!runnerUpCandidate) return true;

  const bestScore = Number.isFinite(bestCandidate.score) ? bestCandidate.score : -Infinity;
  const runnerUpScore = Number.isFinite(runnerUpCandidate.score) ? runnerUpCandidate.score : -Infinity;
  const scoreGap = bestScore - runnerUpScore;
  const coverageGap = bestCandidate.coverage - runnerUpCandidate.coverage;

  return scoreGap >= SOLVED_SCORE_MARGIN || coverageGap >= SOLVED_COVERAGE_MARGIN;
}

function setWidthBarStates(widthBars, activeWidth, candidateWidths) {
  const candidateSet = new Set(candidateWidths);
  for (let i = 0; i < widthBars.length; i++) {
    const width = widthBars[i].width;
    widthBars[i] = {
      ...widthBars[i],
      status: width === activeWidth
        ? "winner"
        : candidateSet.has(width)
          ? "candidate"
          : "rejected",
    };
  }
}

function* refineTranspositionCandidate(
  ciphertext,
  candidate,
  initMapping,
  widthBars,
  totalIterations,
  globalIterRef
) {
  const W = candidate.width;
  let bestTransOrder = candidate.order.slice();
  let bestTransHalf = columnarDecryptByOrder(ciphertext, W, bestTransOrder);
  let bestTransFitness = transScore(bestTransHalf);

  for (let restart = 0; restart < REFINE_TRANS_RESTARTS; restart++) {
    let trialOrder = restart === 0 ? bestTransOrder.slice() : shuffledOrder(W);
    let trialHalf = columnarDecryptByOrder(ciphertext, W, trialOrder);
    let trialScore = transScore(trialHalf);

    for (let k = 0; k < REFINE_TRANS_ITERS_PER_RESTART; k++) {
      globalIterRef.value++;
      const next = neighborOrder(trialOrder);
      const nextHalf = columnarDecryptByOrder(ciphertext, W, next);
      const nextScore = transScore(nextHalf);
      const delta = nextScore - trialScore;
      const T = transTemperature(k, REFINE_TRANS_ITERS_PER_RESTART);
      const accepted = delta > 0 || Math.random() < Math.exp(delta / T);
      const swappedColumns = changedOrderPositions(trialOrder, next);

      if (accepted) {
        trialOrder = next;
        trialHalf = nextHalf;
        trialScore = nextScore;
      }

      yield {
        phase: "REFINING_TRANS",
        score: trialScore,
        decoded: applyMapping(trialHalf, initMapping),
        iteration: globalIterRef.value,
        totalIterations,
        mapping: { ...initMapping },
        transWidth: W,
        transOrder: trialOrder.slice(),
        widthBars: cloneWidthBars(widthBars),
        swappedPair: null,
        swappedColumns,
        accepted,
      };
    }

    if (trialScore > bestTransFitness) {
      bestTransFitness = trialScore;
      bestTransOrder = trialOrder.slice();
      bestTransHalf = trialHalf;
    }
  }

  return {
    width: W,
    order: bestTransOrder.slice(),
    halfDecoded: bestTransHalf,
    score: bestTransFitness,
  };
}

// ---------- main iterator ----------

export function* createProductSolverIterator(ciphertext, { rounds = DEFAULT_ROUNDS } = {}) {
  const N = ciphertext.length;
  const maxW = maxWidthFor(N);

  if (N < 24 || maxW < MIN_WIDTH) {
    yield {
      phase: "FAILED",
      score: 0,
      decoded: ciphertext,
      iteration: 0,
      totalIterations: 0,
      mapping: {},
      transWidth: null,
      transOrder: [],
      widthBars: [],
      swappedPair: null,
      swappedColumns: null,
      accepted: null,
    };
    return;
  }

  // Initial mapping is fixed for the trans phase — it doesn't matter what it
  // is (bigram entropy is substitution-invariant), but the UI wants a mapping
  // to display. Frequency-init is the natural starting point.
  const initMapping = buildInitialMapping(ciphertext);

  const widthCount = maxW - MIN_WIDTH + 1;
  const analyzeIterPerWidth = ANALYZING_TRANS_RESTARTS * ANALYZING_TRANS_ITERS_PER_RESTART;
  const analyzeTotal = widthCount * analyzeIterPerWidth;
  const perCandidateRefineTransTotal = REFINE_TRANS_RESTARTS * REFINE_TRANS_ITERS_PER_RESTART;
  const candidateCount = Math.min(TOP_TRANS_CANDIDATES, widthCount);
  const totalIterations =
    analyzeTotal +
    candidateCount * perCandidateRefineTransTotal +
    candidateCount * solverTotalIterations(rounds);
  let globalIter = 0;

  // ----- ANALYZING (width + trans search by bigram entropy) -----

  const widthBars = [];
  for (let w = MIN_WIDTH; w <= maxW; w++) {
    widthBars.push({ width: w, score: 0, status: "computing" });
  }

  const widthResults = []; // { width, order, score }

  for (let wi = 0; wi < widthCount; wi++) {
    const W = MIN_WIDTH + wi;

    let bestOrder = identityOrder(W);
    let bestHalf = columnarDecryptByOrder(ciphertext, W, bestOrder);
    let bestScore = transScore(bestHalf);
    let iterInWidth = 0;

    for (let restart = 0; restart < ANALYZING_TRANS_RESTARTS; restart++) {
      let order = restart === 0 ? identityOrder(W) : shuffledOrder(W);
      let half = columnarDecryptByOrder(ciphertext, W, order);
      let score = transScore(half);

      for (let k = 0; k < ANALYZING_TRANS_ITERS_PER_RESTART; k++) {
        globalIter++;
        iterInWidth++;
        const trial = neighborOrder(order);
        const trialHalf = columnarDecryptByOrder(ciphertext, W, trial);
        const trialScore = transScore(trialHalf);
        const delta = trialScore - score;
        const T = transTemperature(k, ANALYZING_TRANS_ITERS_PER_RESTART);
        if (delta > 0 || Math.random() < Math.exp(delta / T)) {
          order = trial;
          half = trialHalf;
          score = trialScore;
          if (score > bestScore) {
            bestScore = score;
            bestOrder = order.slice();
            bestHalf = half;
          }
        }

        if (iterInWidth % ANALYZING_YIELD_EVERY === 0) {
          widthBars[wi] = { width: W, score: bestScore, status: "computing" };
          const decoded = applyMapping(half, initMapping);
          yield {
            phase: "ANALYZING",
            score,
            decoded,
            iteration: globalIter,
            totalIterations,
            mapping: { ...initMapping },
            transWidth: W,
            transOrder: order.slice(),
            widthBars: cloneWidthBars(widthBars),
            swappedPair: null,
            swappedColumns: null,
            accepted: null,
          };
        }
      }

    }

    widthBars[wi] = { width: W, score: bestScore, status: "candidate" };
    widthResults.push({ width: W, order: bestOrder.slice(), score: bestScore });

    yield {
      phase: "ANALYZING",
      score: bestScore,
      decoded: applyMapping(bestHalf, initMapping),
      iteration: globalIter,
      totalIterations,
      mapping: { ...initMapping },
      transWidth: W,
      transOrder: bestOrder.slice(),
      widthBars: cloneWidthBars(widthBars),
      swappedPair: null,
      swappedColumns: null,
      accepted: null,
    };
  }

  widthResults.sort((a, b) => b.score - a.score);
  const transCandidates = widthResults.slice(0, candidateCount);
  const candidateWidths = transCandidates.map((candidate) => candidate.width);
  setWidthBarStates(widthBars, transCandidates[0]?.width ?? null, candidateWidths);

  // ----- REFINING_TRANS (deeper polish for the retained width/order candidates) -----

  const refinedCandidates = [];
  const iterRef = { value: globalIter };
  for (const candidate of transCandidates) {
    setWidthBarStates(widthBars, candidate.width, candidateWidths);
    const refineIter = refineTranspositionCandidate(
      ciphertext,
      candidate,
      initMapping,
      widthBars,
      totalIterations,
      iterRef
    );

    let refineStep = refineIter.next();
    while (!refineStep.done) {
      yield refineStep.value;
      refineStep = refineIter.next();
    }
    refinedCandidates.push(refineStep.value);
  }
  globalIter = iterRef.value;

  // ----- RAW CANDIDATE GATE -----

  const consideredCandidates = [];
  for (const candidate of refinedCandidates) {
    const rawDecoded = candidate.halfDecoded;
    const rawCandidate = makeDecodedCandidate({
      decoded: rawDecoded,
      mapping: buildIdentityMapping(rawDecoded),
      width: candidate.width,
      order: candidate.order,
    });
    consideredCandidates.push(rawCandidate);
  }

  // ----- REFINING_SUBST -----

  for (const candidate of refinedCandidates) {
    setWidthBarStates(widthBars, candidate.width, candidateWidths);

    const rawCandidate = makeDecodedCandidate({
      decoded: candidate.halfDecoded,
      mapping: buildIdentityMapping(candidate.halfDecoded),
      width: candidate.width,
      order: candidate.order,
    });
    let bestForTransCandidate = rawCandidate;

    const substIter = createSolverIterator(candidate.halfDecoded, { rounds });
    for (const data of substIter) {
      globalIter++;

      if (data.phase === "MAPPING" || data.phase === "SOLVED") {
        const scoredCandidate = makeDecodedCandidate({
          decoded: data.decoded,
          mapping: { ...data.mapping },
          width: candidate.width,
          order: candidate.order,
          score: data.score,
        });
        bestForTransCandidate = pickBetterCandidate(bestForTransCandidate, scoredCandidate);
      }

      if (data.phase !== "SOLVED") {
        yield {
          phase: "REFINING_SUBST",
          score: data.score,
          decoded: data.decoded,
          iteration: globalIter,
          totalIterations,
          mapping: { ...data.mapping },
          transWidth: candidate.width,
          transOrder: candidate.order.slice(),
          widthBars: cloneWidthBars(widthBars),
          swappedPair: data.swappedPair ?? null,
          swappedColumns: null,
          accepted: data.accepted ?? null,
        };
      }
    }

    consideredCandidates.push(bestForTransCandidate);
  }

  // ----- TERMINAL -----

  const { best: bestOverallCandidate, runnerUp: runnerUpCandidate } = findTopCandidates(consideredCandidates);
  setWidthBarStates(widthBars, bestOverallCandidate?.width ?? null, candidateWidths);
  const terminalPhase = isConfidentSolved(bestOverallCandidate, runnerUpCandidate)
    ? "SOLVED"
    : "FAILED";

  yield {
    phase: terminalPhase,
    score: bestOverallCandidate?.score ?? 0,
    decoded: bestOverallCandidate?.decoded ?? ciphertext,
    iteration: globalIter,
    totalIterations,
    mapping: { ...(bestOverallCandidate?.mapping ?? {}) },
    transWidth: bestOverallCandidate?.width ?? null,
    transOrder: bestOverallCandidate?.order.slice() ?? [],
    widthBars: cloneWidthBars(widthBars),
    swappedPair: null,
    swappedColumns: null,
    accepted: null,
  };
}
