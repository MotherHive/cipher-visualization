const UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWERCASE = "abcdefghijklmnopqrstuvwxyz";
const DIGITS = "0123456789";
const PUNCTUATION = "!@#$%^&*()-_=+[]{};:'\",.<>/?\\|`~";

const EXCLUDED_SELECTOR = [
  ".text-grid",
  ".input-text",
  ".mapping-table",
  ".score-track",
  ".frequency-chart",
  ".topic-tab p",
  ".topic-tab button",
  ".topic-rail",
  ".topic-tab .topic-figure",
  ".topic-tab [class^=\"diagram-\"]",
  ".topic-tab [class*=\" diagram-\"]",
  ".attack-iter",
  ".attack-state",
  ".score-value",
  "input",
  "textarea",
  "select",
  "option",
  "script",
  "style",
].join(", ");

const MIN_DELAY_MS = 1100;
const MAX_DELAY_MS = 2200;
const MIN_MUTATIONS_PER_TICK = 1;
const MAX_MUTATIONS_PER_TICK = 3;
const MIN_MUTATION_LENGTH = 1;
const MAX_MUTATION_LENGTH = 4;
const MIN_FLICKERS = 3;
const MAX_FLICKERS = 6;
const FLICKER_STEP_MS = 45;

export function initAmbientText() {
  let loopTimer = null;
  const activeMutations = new Set();

  function clearLoopTimer() {
    if (loopTimer !== null) {
      clearTimeout(loopTimer);
      loopTimer = null;
    }
  }

  function restoreActiveMutation() {
    for (const mutation of activeMutations) {
      clearTimeout(mutation.timerId);
      if (mutation.node.isConnected) {
        mutation.node.textContent = mutation.originalText;
      }
    }
    activeMutations.clear();
  }

  function scheduleNextTick() {
    clearLoopTimer();
    const delay = randomBetween(MIN_DELAY_MS, MAX_DELAY_MS);
    loopTimer = window.setTimeout(() => {
      loopTimer = null;
      if (document.hidden) return;
      triggerAmbientMutation();
      scheduleNextTick();
    }, delay);
  }

  function triggerAmbientMutation() {
    const mutationCount = randomBetween(MIN_MUTATIONS_PER_TICK, MAX_MUTATIONS_PER_TICK);
    const reservedNodes = new Set();

    for (let i = 0; i < mutationCount; i += 1) {
      const target = pickRandomTarget(reservedNodes);
      if (!target) break;

      reservedNodes.add(target.node);
      startMutation(target);
    }
  }

  function startMutation({ node, startIndex, length }) {
    const originalText = node.textContent ?? "";
    const flickerCount = randomBetween(MIN_FLICKERS, MAX_FLICKERS);
    const mutation = {
      node,
      startIndex,
      length,
      originalText,
      flickersRemaining: flickerCount,
      timerId: null,
    };

    activeMutations.add(mutation);

    const step = () => {
      if (!activeMutations.has(mutation)) return;
      if (!node.isConnected) {
        activeMutations.delete(mutation);
        return;
      }

      if (mutation.flickersRemaining <= 0) {
        node.textContent = originalText;
        activeMutations.delete(mutation);
        return;
      }

      const originalSlice = originalText.slice(startIndex, startIndex + length);
      const nextSlice = buildReplacementSlice(originalSlice);
      node.textContent = replaceRangeAt(originalText, startIndex, length, nextSlice);
      mutation.flickersRemaining -= 1;
      mutation.timerId = window.setTimeout(step, FLICKER_STEP_MS);
    };

    step();
  }

  function pickRandomTarget(reservedNodes = new Set()) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const candidates = [];

    let node = walker.nextNode();
    while (node) {
      if (!reservedNodes.has(node) && isEligibleTextNode(node)) {
        const runs = eligibleCharacterRuns(node.textContent ?? "");
        if (runs.length) {
          candidates.push({
            node,
            runs,
          });
        }
      }
      node = walker.nextNode();
    }

    if (!candidates.length) return null;

    const candidate = candidates[Math.floor(Math.random() * candidates.length)];
    const run = candidate.runs[Math.floor(Math.random() * candidate.runs.length)];
    const maxLength = Math.min(MAX_MUTATION_LENGTH, run.length);
    const length = randomBetween(MIN_MUTATION_LENGTH, maxLength);
    const maxOffset = run.length - length;
    const offset = maxOffset > 0 ? randomBetween(0, maxOffset) : 0;

    return {
      node: candidate.node,
      startIndex: run.start + offset,
      length,
    };
  }

  function handleVisibilityChange() {
    if (document.hidden) {
      clearLoopTimer();
      restoreActiveMutation();
      return;
    }
    scheduleNextTick();
  }

  document.addEventListener("visibilitychange", handleVisibilityChange);
  scheduleNextTick();
}

function isEligibleTextNode(node) {
  const parent = node.parentElement;
  if (!parent || !parent.isConnected) return false;
  if (parent.closest(EXCLUDED_SELECTOR)) return false;
  if (!isElementVisible(parent)) return false;

  const text = node.textContent ?? "";
  if (!text.trim()) return false;
  return /[A-Za-z0-9]/.test(text);
}

function isElementVisible(element) {
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
    return false;
  }
  return element.getClientRects().length > 0;
}

function eligibleCharacterRuns(text) {
  const runs = [];
  let runStart = -1;

  for (let i = 0; i < text.length; i += 1) {
    if (/[A-Za-z0-9]/.test(text[i])) {
      if (runStart === -1) {
        runStart = i;
      }
      continue;
    }

    if (runStart !== -1) {
      runs.push({
        start: runStart,
        length: i - runStart,
      });
      runStart = -1;
    }
  }

  if (runStart !== -1) {
    runs.push({
      start: runStart,
      length: text.length - runStart,
    });
  }

  return runs;
}

function randomReplacementFor(char) {
  if (/[A-Z]/.test(char)) return randomCharFrom(UPPERCASE);
  if (/[a-z]/.test(char)) return randomCharFrom(LOWERCASE);
  if (/[0-9]/.test(char)) return randomCharFrom(DIGITS);
  return randomCharFrom(PUNCTUATION);
}

function randomCharFrom(alphabet) {
  return alphabet[Math.floor(Math.random() * alphabet.length)];
}

function buildReplacementSlice(text) {
  return text.split("").map((char) => {
    const replacement = randomReplacementFor(char);
    return replacement === char ? randomReplacementFor(char) : replacement;
  }).join("");
}

function replaceRangeAt(text, startIndex, length, replacement) {
  return text.slice(0, startIndex) + replacement + text.slice(startIndex + length);
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
