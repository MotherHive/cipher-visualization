import { PRINTABLE_RANGE } from "./constants.js";

let activeAnimation = null;
const MAX_HISTOGRAM_ROWS = 26;
const ENGLISH_FREQ_FLOOR = 0.0001;
const ENGLISH_FREQ_MAP = {
  " ": 0.1831,
  e: 0.1026,
  t: 0.0751,
  a: 0.0654,
  o: 0.06,
  i: 0.0566,
  n: 0.0566,
  s: 0.0531,
  r: 0.0498,
  h: 0.0468,
  l: 0.0331,
  d: 0.0328,
  u: 0.0228,
  c: 0.0223,
  m: 0.0203,
  f: 0.0198,
  w: 0.017,
  g: 0.0162,
  y: 0.0143,
  p: 0.0137,
  b: 0.0123,
  v: 0.008,
  k: 0.0056,
  "'": 0.004,
  j: 0.001,
  x: 0.0009,
  q: 0.0008,
  z: 0.0007,
  ".": 0.0065,
  ",": 0.0061,
  "\"": 0.003,
  "-": 0.002,
  "!": 0.0012,
  "?": 0.001,
  ";": 0.0006,
  ":": 0.0006,
  "(": 0.0004,
  ")": 0.0004,
  0: 0.0009,
  1: 0.0008,
  2: 0.0006,
  3: 0.0004,
  4: 0.0003,
  5: 0.0003,
  6: 0.0003,
  7: 0.0003,
  8: 0.0003,
  9: 0.0003,
};
const ENGLISH_SHAPE = [
  ...Object.values(ENGLISH_FREQ_MAP),
  ...new Array(PRINTABLE_RANGE - Object.keys(ENGLISH_FREQ_MAP).length).fill(
    ENGLISH_FREQ_FLOOR
  ),
].sort((a, b) => b - a);

/**
 * Renders a horizontal bar chart that animates as if scanning
 * through the text and collecting character counts one by one.
 */
export function renderHistogram(text, container) {
  // Cancel any in-progress animation
  if (activeAnimation) {
    cancelAnimationFrame(activeAnimation);
    activeAnimation = null;
  }

  container.innerHTML = "";

  // Pre-compute final counts to know the sort order and max
  const finalCounts = {};
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (code >= 32 && code <= 126) {
      finalCounts[char] = (finalCounts[char] || 0) + 1;
    }
  }

  const sorted = Object.keys(finalCounts).sort(
    (a, b) => finalCounts[b] - finalCounts[a]
  );

  if (sorted.length === 0) return;

  const visibleChars = sorted.slice(0, MAX_HISTOGRAM_ROWS);
  const finalMax = finalCounts[sorted[0]];
  const totalPrintable = sorted.reduce((sum, char) => sum + finalCounts[char], 0);
  const expectedCounts = visibleChars.map(
    (_, index) => (ENGLISH_SHAPE[index] ?? ENGLISH_FREQ_FLOOR) * totalPrintable
  );
  const expectedMax = expectedCounts.reduce((max, count) => Math.max(max, count), 0);
  const scaleMax = Math.max(finalMax, expectedMax, 1);

  // Build all rows up front with zero-width bars
  const bars = {};
  const countLabels = {};

  for (const [index, char] of visibleChars.entries()) {
    const row = document.createElement("div");
    row.className = "hist-row";

    const label = document.createElement("span");
    label.className = "hist-label";
    label.textContent = char;

    const barWrap = document.createElement("div");
    barWrap.className = "hist-bar-wrap";

    const baseline = document.createElement("div");
    baseline.className = "hist-baseline";
    baseline.style.width = (expectedCounts[index] / scaleMax) * 100 + "%";

    const bar = document.createElement("div");
    bar.className = "hist-bar";
    bar.style.width = "0%";
    bar.style.transition = "width 150ms ease-out";

    const countLabel = document.createElement("span");
    countLabel.className = "hist-count";
    countLabel.textContent = "0";

    barWrap.appendChild(baseline);
    barWrap.appendChild(bar);
    row.appendChild(label);
    row.appendChild(barWrap);
    row.appendChild(countLabel);
    container.appendChild(row);

    bars[char] = bar;
    countLabels[char] = countLabel;
  }

  // Filter to printable chars for scanning
  const printable = [];
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (code >= 32 && code <= 126) printable.push(char);
  }

  // Animate: scan through chars in batches per frame
  const totalChars = printable.length;
  const duration = 500; // total animation time in ms
  const liveCounts = {};
  let scanned = 0;

  const t0 = performance.now();

  function tick(now) {
    const elapsed = now - t0;
    const target = Math.min(
      totalChars,
      Math.floor((elapsed / duration) * totalChars)
    );

    // Process chars up to target
    while (scanned < target) {
      const char = printable[scanned];
      liveCounts[char] = (liveCounts[char] || 0) + 1;
      scanned++;
    }

    // Update bar widths and counts
    for (const char of visibleChars) {
      const count = liveCounts[char] || 0;
      bars[char].style.width = (count / scaleMax) * 100 + "%";
      countLabels[char].textContent = count;
    }

    if (scanned < totalChars) {
      activeAnimation = requestAnimationFrame(tick);
    } else {
      activeAnimation = null;
    }
  }

  activeAnimation = requestAnimationFrame(tick);
}
