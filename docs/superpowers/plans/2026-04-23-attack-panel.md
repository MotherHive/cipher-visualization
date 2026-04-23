# Attack Tooling Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a visual mapping solver panel that cracks Caesar and Substitution ciphers using frequency analysis + hill climbing, with animated feedback showing the process.

**Architecture:** Pure solver logic in `js/solver.js` (no DOM). UI rendering and animation orchestration in `js/attack-panel.js`. The solver exposes a step-by-step iterator that the UI consumes at its own animation pace. Existing `js/caesar.js` gets minor refactoring to expose grid/cell update functions the attack panel needs.

**Tech Stack:** Vanilla JS (ES modules), CSS custom properties, HTML Canvas for the score sparkline, requestAnimationFrame for animation pacing.

**Spec:** `docs/superpowers/specs/2026-04-22-attack-panel-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `js/solver.js` (new) | Pure solver: English frequency table, bigram log-probability table, frequency-based initial mapping, hill-climb iterator, Caesar detection, fitness scoring |
| `js/attack-panel.js` (new) | DOM rendering: mapping table, score sparkline (canvas), controls toolbar, state machine, animation loop, grid cell highlighting |
| `index.html` (modify) | Add attack panel HTML skeleton below `.workspace` |
| `css/style.css` (modify) | Add attack panel styles: layout, mapping cells, sparkline, controls, cell state colors, grid highlight classes |
| `js/caesar.js` (modify) | Export `renderGrid` and `PRINTABLE_START`/`PRINTABLE_END`/`PRINTABLE_RANGE` constants; make `updateGrid` callable externally |
| `js/main.js` (modify) | Wire Solve button to attack panel; pass required DOM refs |

---

## Task 1: Solver Core — Frequency Tables and Scoring

**Files:**
- Create: `js/solver.js`

This task builds the pure-logic foundation: English character frequencies, bigram scoring, and the initial frequency-based mapping function. No DOM, no animation.

- [ ] **Step 1: Create `js/solver.js` with English frequency table**

```js
// js/solver.js

const PRINTABLE_START = 32;
const PRINTABLE_END = 126;
const PRINTABLE_RANGE = PRINTABLE_END - PRINTABLE_START + 1; // 95

// English character frequencies for printable ASCII (approximate).
// Space is most frequent. Derived from large English text corpora.
// Characters not listed here get a small floor value.
const ENGLISH_FREQ_MAP = {
  ' ': 0.1831,
  'e': 0.1026, 't': 0.0751, 'a': 0.0653, 'o': 0.0616,
  'i': 0.0567, 'n': 0.0571, 's': 0.0508, 'h': 0.0498,
  'r': 0.0499, 'd': 0.0328, 'l': 0.0331, 'c': 0.0223,
  'u': 0.0228, 'm': 0.0202, 'w': 0.0171, 'f': 0.0182,
  'g': 0.0165, 'y': 0.0142, 'p': 0.0152, 'b': 0.0126,
  'v': 0.0080, 'k': 0.0056, 'j': 0.0010, 'x': 0.0013,
  'q': 0.0008, 'z': 0.0005,
  ',': 0.0100, '.': 0.0090, "'": 0.0030, '"': 0.0025,
  '-': 0.0015, '!': 0.0010, '?': 0.0010, ';': 0.0005,
  ':': 0.0005, '(': 0.0003, ')': 0.0003,
};

// Build sorted English frequency order (most frequent first)
// Include all printable ASCII; unlisted chars get a floor frequency.
const FREQ_FLOOR = 0.0001;

const ENGLISH_FREQ_ORDER = [];
for (let code = PRINTABLE_START; code <= PRINTABLE_END; code++) {
  const ch = String.fromCharCode(code);
  ENGLISH_FREQ_ORDER.push({ char: ch, freq: ENGLISH_FREQ_MAP[ch] || FREQ_FLOOR });
}
ENGLISH_FREQ_ORDER.sort((a, b) => b.freq - a.freq);

export { ENGLISH_FREQ_ORDER };
```

- [ ] **Step 2: Add bigram log-probability table and `scoreBigrams` function**

Append to `js/solver.js`:

```js
// Bigram log-probabilities.
// Built from a 26-letter + space model, keyed by two-char string.
// We store log10(probability). Unknown bigrams get a floor penalty.
const BIGRAM_LOG = {};
const BIGRAM_FLOOR = -6;

// Top ~100 English bigrams with approximate log10(freq) values.
// These are derived from standard English bigram frequency tables.
const COMMON_BIGRAMS = {
  'th': -1.31, 'he': -1.40, 'in': -1.55, 'er': -1.62, 'an': -1.65,
  'nd': -1.84, 'on': -1.88, 'en': -1.89, 'at': -1.90, 'ou': -1.91,
  'ed': -1.92, 'ha': -1.93, 'to': -1.93, 'or': -1.96, 'it': -1.97,
  'is': -1.98, 'hi': -2.00, 'es': -2.01, 'ng': -2.02, 'st': -2.10,
  're': -2.06, 'nt': -2.14, 'ti': -2.18, 'al': -2.20, 'ar': -2.22,
  'te': -2.23, 'se': -2.25, 'le': -2.27, 'of': -2.28, 'me': -2.30,
  'ne': -2.31, 'de': -2.33, 've': -2.35, 'as': -2.36, 'ea': -2.38,
  'el': -2.40, 'no': -2.42, 'li': -2.44, 'ri': -2.45, 'ro': -2.46,
  'co': -2.48, 'ce': -2.50, 'io': -2.52, 'om': -2.54, 'il': -2.55,
  'us': -2.56, 'ma': -2.58, 'la': -2.60, 'et': -2.62, 'si': -2.64,
  ' t': -1.50, ' a': -1.70, ' s': -1.80, ' i': -1.85, ' w': -1.90,
  ' o': -1.92, ' h': -1.95, ' b': -2.10, ' m': -2.15, ' f': -2.18,
  'e ': -1.55, 'd ': -1.80, 't ': -1.85, 's ': -1.75, 'n ': -1.90,
  'y ': -2.00, 'f ': -2.10, ', ': -2.20, '. ': -2.30,
};

// Populate the lookup from lowercase pairs; also add uppercase equivalents
for (const [pair, logP] of Object.entries(COMMON_BIGRAMS)) {
  BIGRAM_LOG[pair] = logP;
  BIGRAM_LOG[pair.toUpperCase()] = logP;
  // Mixed case: capitalize first
  BIGRAM_LOG[pair[0].toUpperCase() + pair[1]] = logP;
}

export function scoreBigrams(text) {
  let score = 0;
  for (let i = 0; i < text.length - 1; i++) {
    const pair = text[i] + text[i + 1];
    score += BIGRAM_LOG[pair] ?? BIGRAM_FLOOR;
  }
  return score;
}
```

- [ ] **Step 3: Add `buildInitialMapping` and `applyMapping` functions**

Append to `js/solver.js`:

```js
export function countFrequencies(text) {
  const counts = {};
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code >= PRINTABLE_START && code <= PRINTABLE_END) {
      counts[ch] = (counts[ch] || 0) + 1;
    }
  }
  return counts;
}

export function buildInitialMapping(ciphertext) {
  const counts = countFrequencies(ciphertext);

  // Sort ciphertext chars by frequency (most frequent first)
  const cipherChars = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);

  // Map each cipher char to the English char at the same frequency rank
  const mapping = {};
  for (let i = 0; i < cipherChars.length; i++) {
    mapping[cipherChars[i]] = ENGLISH_FREQ_ORDER[i]?.char ?? cipherChars[i];
  }
  return mapping;
}

export function applyMapping(ciphertext, mapping) {
  return ciphertext.split("").map(ch => mapping[ch] ?? ch).join("");
}
```

- [ ] **Step 4: Add Caesar detection**

Append to `js/solver.js`:

```js
export function detectCaesar(mapping) {
  const entries = Object.entries(mapping);
  if (entries.length === 0) return null;

  const shifts = entries.map(([from, to]) => {
    const diff = to.charCodeAt(0) - from.charCodeAt(0);
    return ((diff % PRINTABLE_RANGE) + PRINTABLE_RANGE) % PRINTABLE_RANGE;
  });

  const firstShift = shifts[0];
  const allSame = shifts.every(s => s === firstShift);
  return allSame ? firstShift : null;
}
```

- [ ] **Step 5: Add English bigram/trigram detection for highlighting**

Append to `js/solver.js`:

```js
const COMMON_ENGLISH = new Set([
  'th', 'he', 'in', 'er', 'an', 'nd', 'on', 'en', 'at', 'ou',
  'ed', 'ha', 'to', 'or', 'it', 'is', 'hi', 'es', 'ng', 'st',
  'the', 'and', 'ing', 'her', 'hat', 'his', 'tha', 'ere', 'for',
  'ent', 'ion', 'ter', 'was', 'you', 'ith', 'ver', 'all', 'wit',
  'thi', 'tio',
]);

export function findEnglishSpans(text) {
  // Returns array of booleans, one per character.
  // true = this char is part of a recognized English bigram/trigram.
  const marks = new Array(text.length).fill(false);
  const lower = text.toLowerCase();

  // Check trigrams first, then bigrams
  for (let i = 0; i <= lower.length - 3; i++) {
    if (COMMON_ENGLISH.has(lower.slice(i, i + 3))) {
      marks[i] = marks[i + 1] = marks[i + 2] = true;
    }
  }
  for (let i = 0; i <= lower.length - 2; i++) {
    if (COMMON_ENGLISH.has(lower.slice(i, i + 2))) {
      marks[i] = marks[i + 1] = true;
    }
  }
  return marks;
}
```

- [ ] **Step 6: Verify in browser console**

Open `index.html` in a browser. In the console, run:

```js
import('/js/solver.js').then(m => {
  const cipher = m.applyMapping("KHOOR ZRUOG", m.buildInitialMapping("KHOOR ZRUOG"));
  console.log("Decoded:", cipher);
  console.log("Score:", m.scoreBigrams(cipher));
  console.log("Caesar?", m.detectCaesar(m.buildInitialMapping("KHOOR ZRUOG")));
  console.log("Freq order[0]:", m.ENGLISH_FREQ_ORDER[0]);
});
```

Expected: functions load without errors, score returns a negative number, Caesar detection returns a number or null.

- [ ] **Step 7: Commit**

```bash
git add js/solver.js
git commit -m "feat: add solver core — frequency tables, bigram scoring, Caesar detection"
```

---

## Task 2: Hill Climbing Iterator

**Files:**
- Modify: `js/solver.js`

Add the hill-climbing logic as a step-by-step iterator the UI can consume one step at a time.

- [ ] **Step 1: Add `createSolverIterator` generator function**

Append to `js/solver.js`:

```js
export function* createSolverIterator(ciphertext) {
  const mapping = buildInitialMapping(ciphertext);
  let decoded = applyMapping(ciphertext, mapping);
  let currentScore = scoreBigrams(decoded);

  // Yield initial state
  yield {
    phase: "MAPPING",
    mapping: { ...mapping },
    score: currentScore,
    decoded,
    accepted: null,
    swappedPair: null,
  };

  // Check for Caesar
  const shift = detectCaesar(mapping);
  if (shift !== null) {
    yield {
      phase: "SOLVED",
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

  // Hill climbing
  const cipherChars = Object.keys(mapping);
  let noImproveCount = 0;
  const MAX_NO_IMPROVE = 500;
  const MAX_ITERATIONS = 5000;
  let iteration = 0;

  while (noImproveCount < MAX_NO_IMPROVE && iteration < MAX_ITERATIONS) {
    iteration++;

    // Pick two random distinct cipher chars to swap their plaintext mappings
    const i = Math.floor(Math.random() * cipherChars.length);
    let j = Math.floor(Math.random() * (cipherChars.length - 1));
    if (j >= i) j++;

    const charA = cipherChars[i];
    const charB = cipherChars[j];

    // Swap
    const tmp = mapping[charA];
    mapping[charA] = mapping[charB];
    mapping[charB] = tmp;

    decoded = applyMapping(ciphertext, mapping);
    const newScore = scoreBigrams(decoded);
    const accepted = newScore > currentScore;

    if (accepted) {
      currentScore = newScore;
      noImproveCount = 0;
    } else {
      // Revert
      mapping[charB] = mapping[charA];
      mapping[charA] = tmp;
      decoded = applyMapping(ciphertext, mapping);
      noImproveCount++;
    }

    yield {
      phase: "REFINING",
      mapping: { ...mapping },
      score: currentScore,
      decoded,
      accepted,
      swappedPair: [charA, charB],
      iteration,
    };
  }

  // Final state
  yield {
    phase: "SOLVED",
    mapping: { ...mapping },
    score: currentScore,
    decoded,
    accepted: null,
    swappedPair: null,
    caesar: false,
  };
}
```

- [ ] **Step 2: Verify in browser console**

```js
import('/js/solver.js').then(m => {
  // Use a simple Caesar-shifted text
  const cipher = "Khoor#Zruog"; // "Hello World" shifted by 3 in ASCII
  const iter = m.createSolverIterator(cipher);
  let step;
  let count = 0;
  do {
    step = iter.next();
    count++;
  } while (!step.done && count < 10);
  console.log("Steps taken:", count);
  console.log("Last step:", step.value);
});
```

Expected: iterator yields objects with phase, mapping, score, and eventually reaches SOLVED or REFINING.

- [ ] **Step 3: Commit**

```bash
git add js/solver.js
git commit -m "feat: add hill-climbing solver iterator"
```

---

## Task 3: Export Shared Constants from `caesar.js`

**Files:**
- Modify: `js/caesar.js`

The attack panel needs to update grid cells and read the current ciphertext. Export the constants and `renderGrid` so the attack panel can reuse them.

- [ ] **Step 1: Export `renderGrid` and constants**

In `js/caesar.js`, change the three `const` declarations and `renderGrid` from private to exported:

Change line 44-46 from:
```js
const PRINTABLE_START = 32;  // space
const PRINTABLE_END = 126;   // tilde ~
const PRINTABLE_RANGE = PRINTABLE_END - PRINTABLE_START + 1; // 95
```
to:
```js
export const PRINTABLE_START = 32;  // space
export const PRINTABLE_END = 126;   // tilde ~
export const PRINTABLE_RANGE = PRINTABLE_END - PRINTABLE_START + 1; // 95
```

Change line 64 from:
```js
function renderGrid(text, container) {
```
to:
```js
export function renderGrid(text, container) {
```

- [ ] **Step 2: Store and export current ciphertext state**

In `js/caesar.js`, add a module-level variable to track the current displayed text, so the attack panel knows what to solve. Modify `initCaesar`:

After line 10 (`let lastEncrypted = null;`), add:
```js
    let currentDisplayedText = inputText.value;
```

Inside `updateGrid`, after `scrambleReveal(text, gridContainer);` (line 20), add:
```js
        currentDisplayedText = text;
```

At the end of `initCaesar` (before the closing `}`), add:
```js
    tab._getCurrentText = () => currentDisplayedText;
    tab._getGridContainer = () => gridContainer;
```

- [ ] **Step 3: Verify page still works**

Open `index.html` in browser. Click Encrypt, change plaintext, click randomize. Everything should work exactly as before.

- [ ] **Step 4: Commit**

```bash
git add js/caesar.js
git commit -m "refactor: export grid utilities and expose current text from caesar module"
```

---

## Task 4: Attack Panel HTML and CSS

**Files:**
- Modify: `index.html`
- Modify: `css/style.css`

Add the attack panel DOM structure and all styles. No JS wiring yet — just the static skeleton.

- [ ] **Step 1: Add attack panel HTML to `index.html`**

In `index.html`, after the closing `</div>` of `.workspace` (line 83) and before the closing `</section>` (line 85), add:

```html

                <!-- Attack Panel -->
                <div class="attack-panel" hidden>
                    <div class="attack-body">
                        <div class="mapping-table-wrap">
                            <h4 class="panel-heading">Mapping</h4>
                            <div class="mapping-table">
                                <div class="mapping-row mapping-row-cipher"></div>
                                <div class="mapping-row mapping-row-plain"></div>
                            </div>
                        </div>
                        <div class="score-track-wrap">
                            <h4 class="panel-heading">Fitness</h4>
                            <div class="score-track">
                                <canvas class="score-canvas"></canvas>
                                <span class="score-value">0</span>
                            </div>
                        </div>
                    </div>
                    <div class="attack-controls">
                        <button class="attack-play-btn" title="Play">&#9654;</button>
                        <button class="attack-step-btn" title="Step" disabled>&#9197;</button>
                        <span class="attack-state">IDLE</span>
                    </div>
                </div>
```

- [ ] **Step 2: Add attack panel CSS**

Append to `css/style.css`, before the ANIMATIONS section:

```css
/* ============================================
  10. Attack Panel
   ============================================ */

.attack-panel {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  margin-top: var(--space-4);
}

.attack-body {
  display: grid;
  grid-template-columns: 7fr 3fr;
  gap: var(--space-4);
}

.mapping-table-wrap {
  min-width: 0;
  overflow-x: auto;
}

.mapping-table {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mapping-row {
  display: flex;
  gap: 2px;
}

.mapping-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  background: var(--bg-elevated);
  border-radius: var(--radius-sm);
  flex-shrink: 0;
  transition: background var(--transition-fast), color var(--transition-fast);
}

.mapping-cell[data-state="empty"] {
  color: var(--text-dim);
}

.mapping-cell[data-state="tentative"] {
  color: #6fbf8a;
  background: #1a2e22;
}

.mapping-cell[data-state="locked"] {
  color: #0a0a0a;
  background: #2d7a4a;
}

.mapping-cell[data-state="swapping"] {
  animation: pulse-swap 300ms ease;
}

@keyframes pulse-swap {
  0%, 100% { transform: scale(1); }
  50%      { transform: scale(1.2); background: var(--warning); }
}

.score-track-wrap {
  display: flex;
  flex-direction: column;
}

.score-track {
  position: relative;
  flex: 1;
  min-height: 80px;
  background: var(--bg-elevated);
  border-radius: var(--radius);
  overflow: hidden;
}

.score-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.score-value {
  position: absolute;
  top: var(--space-1);
  right: var(--space-2);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.attack-controls {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-top: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--border);
}

.attack-play-btn,
.attack-step-btn {
  font-size: var(--text-sm);
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius);
  color: var(--accent);
  background: var(--accent-dim);
  border: 1px solid var(--accent);
  transition: opacity var(--transition-fast);
}

.attack-play-btn:hover,
.attack-step-btn:hover {
  opacity: 0.85;
}

.attack-step-btn:disabled {
  opacity: 0.3;
  cursor: default;
}

.attack-state {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-left: auto;
}

/* Grid cell highlighting during solve */
.cell[data-solve="tentative"] {
  color: #6fbf8a;
}

.cell[data-solve="locked"] {
  color: #2d7a4a;
}

.cell[data-english="true"] {
  background: #0d2818;
}

.cell[data-english="strong"] {
  background: #143d24;
}
```

- [ ] **Step 3: Verify in browser**

Open `index.html`. The attack panel should be hidden (`hidden` attribute). Temporarily remove `hidden` in devtools to verify the layout renders correctly: mapping area on left, score track on right, controls at bottom.

- [ ] **Step 4: Commit**

```bash
git add index.html css/style.css
git commit -m "feat: add attack panel HTML skeleton and CSS styles"
```

---

## Task 5: Attack Panel UI Logic

**Files:**
- Create: `js/attack-panel.js`
- Modify: `js/main.js`

Build the module that drives the attack panel: renders mapping cells, draws the sparkline, manages play/pause/step, and updates the grid.

- [ ] **Step 1: Create `js/attack-panel.js` with initialization and mapping table rendering**

```js
// js/attack-panel.js

import { createSolverIterator, findEnglishSpans, countFrequencies } from "./solver.js";

export function initAttackPanel(panel) {
  const attackPanel = panel.querySelector(".attack-panel");
  const cipherRow = panel.querySelector(".mapping-row-cipher");
  const plainRow = panel.querySelector(".mapping-row-plain");
  const scoreCanvas = panel.querySelector(".score-canvas");
  const scoreValue = panel.querySelector(".score-value");
  const stateLabel = panel.querySelector(".attack-state");
  const playBtn = panel.querySelector(".attack-play-btn");
  const stepBtn = panel.querySelector(".attack-step-btn");
  const gridContainer = panel.querySelector(".text-grid");

  let iterator = null;
  let playing = false;
  let animFrameId = null;
  let cipherChars = [];   // sorted by frequency
  let cipherCells = {};   // char -> DOM element in cipher row
  let plainCells = {};    // char -> DOM element in plain row
  let scoreHistory = [];

  function buildMappingTable(ciphertext) {
    cipherRow.innerHTML = "";
    plainRow.innerHTML = "";
    cipherCells = {};
    plainCells = {};

    const counts = countFrequencies(ciphertext);
    cipherChars = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);

    for (const ch of cipherChars) {
      const cCell = document.createElement("span");
      cCell.className = "mapping-cell";
      cCell.textContent = ch;
      cCell.title = `count: ${counts[ch]}`;
      cipherRow.appendChild(cCell);
      cipherCells[ch] = cCell;

      const pCell = document.createElement("span");
      pCell.className = "mapping-cell";
      pCell.textContent = "\u00B7"; // middle dot
      pCell.dataset.state = "empty";
      plainRow.appendChild(pCell);
      plainCells[ch] = pCell;
    }
  }

  function updateMappingTable(mapping, phase, swappedPair, accepted) {
    for (const ch of cipherChars) {
      const pCell = plainCells[ch];
      const guess = mapping[ch];

      if (!guess) {
        pCell.textContent = "\u00B7";
        pCell.dataset.state = "empty";
        continue;
      }

      pCell.textContent = guess;

      if (phase === "SOLVED") {
        pCell.dataset.state = "locked";
      } else if (swappedPair && (ch === swappedPair[0] || ch === swappedPair[1])) {
        pCell.dataset.state = "swapping";
        // Remove animation class after it finishes so it can re-trigger
        pCell.addEventListener("animationend", () => {
          pCell.dataset.state = accepted ? "locked" : "tentative";
        }, { once: true });
      } else if (pCell.dataset.state !== "locked") {
        pCell.dataset.state = "tentative";
      }
    }
  }

  // --- Score sparkline ---

  function drawSparkline() {
    const ctx = scoreCanvas.getContext("2d");
    const rect = scoreCanvas.getBoundingClientRect();
    scoreCanvas.width = rect.width * devicePixelRatio;
    scoreCanvas.height = rect.height * devicePixelRatio;
    ctx.scale(devicePixelRatio, devicePixelRatio);

    const w = rect.width;
    const h = rect.height;
    ctx.clearRect(0, 0, w, h);

    if (scoreHistory.length < 2) return;

    const scores = scoreHistory.map(s => s.score);
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const range = max - min || 1;

    // Draw main line
    ctx.beginPath();
    ctx.strokeStyle = "#00e87a";
    ctx.lineWidth = 1.5;
    ctx.shadowColor = "#00e87a40";
    ctx.shadowBlur = 4;

    const xStep = w / Math.max(scoreHistory.length - 1, 1);

    for (let i = 0; i < scoreHistory.length; i++) {
      const x = i * xStep;
      const y = h - ((scores[i] - min) / range) * (h - 8) - 4;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Draw red dots for rejected swaps
    ctx.fillStyle = "#ff4d4d";
    for (let i = 0; i < scoreHistory.length; i++) {
      if (scoreHistory[i].accepted === false) {
        const x = i * xStep;
        const y = h - ((scores[i] - min) / range) * (h - 8) - 4;
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // --- Grid highlighting ---

  function updateGridHighlighting(decoded, phase) {
    const spans = gridContainer.querySelectorAll(".cell");
    const englishMarks = findEnglishSpans(decoded);

    for (let i = 0; i < spans.length && i < decoded.length; i++) {
      spans[i].textContent = decoded[i];

      // Solve state coloring
      if (phase === "SOLVED") {
        spans[i].dataset.solve = "locked";
      } else {
        spans[i].dataset.solve = "tentative";
      }

      // English highlighting
      if (englishMarks[i]) {
        // Count how many consecutive marks around this position
        let run = 0;
        for (let j = i; j < englishMarks.length && englishMarks[j]; j++) run++;
        spans[i].dataset.english = run >= 3 ? "strong" : "true";
      } else {
        delete spans[i].dataset.english;
      }
    }
  }

  // --- State machine ---

  function setState(state) {
    stateLabel.textContent = state;
  }

  function processStep(step) {
    if (step.done) {
      stop();
      return;
    }

    const data = step.value;
    setState(data.phase);

    updateMappingTable(data.mapping, data.phase, data.swappedPair, data.accepted);

    scoreHistory.push({ score: data.score, accepted: data.accepted });
    scoreValue.textContent = Math.round(data.score);
    drawSparkline();

    updateGridHighlighting(data.decoded, data.phase);

    if (data.phase === "SOLVED" || data.phase === "FAILED") {
      stop();
    }
  }

  // --- Controls ---

  const STEP_INTERVAL = 50; // ms between auto-steps
  let lastStepTime = 0;

  function autoStep(now) {
    if (!playing || !iterator) return;

    if (now - lastStepTime >= STEP_INTERVAL) {
      lastStepTime = now;
      const step = iterator.next();
      processStep(step);
      if (step.done || step.value?.phase === "SOLVED") return;
    }

    animFrameId = requestAnimationFrame(autoStep);
  }

  function play() {
    playing = true;
    playBtn.innerHTML = "&#9208;"; // pause icon
    stepBtn.disabled = true;
    lastStepTime = performance.now();
    animFrameId = requestAnimationFrame(autoStep);
  }

  function pause() {
    playing = false;
    playBtn.innerHTML = "&#9654;"; // play icon
    stepBtn.disabled = false;
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
  }

  function stop() {
    pause();
    playBtn.disabled = true;
    stepBtn.disabled = true;
  }

  function reset() {
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
    playing = false;
    iterator = null;
    scoreHistory = [];
    playBtn.innerHTML = "&#9654;";
    playBtn.disabled = false;
    stepBtn.disabled = true;
    setState("IDLE");
    scoreValue.textContent = "0";

    // Clear canvas
    const ctx = scoreCanvas.getContext("2d");
    ctx.clearRect(0, 0, scoreCanvas.width, scoreCanvas.height);

    // Clear grid solve attributes
    const spans = gridContainer.querySelectorAll(".cell");
    for (const span of spans) {
      delete span.dataset.solve;
      delete span.dataset.english;
    }
  }

  playBtn.addEventListener("click", () => {
    if (playing) {
      pause();
    } else {
      play();
    }
  });

  stepBtn.addEventListener("click", () => {
    if (!iterator) return;
    const step = iterator.next();
    processStep(step);
  });

  // --- Public API ---

  return {
    startSolve(ciphertext) {
      reset();
      attackPanel.hidden = false;
      buildMappingTable(ciphertext);
      iterator = createSolverIterator(ciphertext);
      setState("ANALYZING");

      // Auto-advance to MAPPING, then pause for user
      const firstStep = iterator.next();
      processStep(firstStep);
      stepBtn.disabled = false;

      // Auto-play
      play();
    },
    reset,
  };
}
```

- [ ] **Step 2: Wire up in `js/main.js`**

Replace the contents of `js/main.js` with:

```js
import { initCaesar } from "./caesar.js";
import { randomKey } from "./keys.js";
import { randomPlaintext } from "./plaintext.js";
import { initAttackPanel } from "./attack-panel.js";

document.addEventListener("DOMContentLoaded", () => {
  const panel = document.getElementById("crypto-solver");
  const cipherSelect = panel.querySelector(".cipher-select");
  const keyInput = panel.querySelector(".key-input");
  const randomizeBtn = panel.querySelector(".randomize-btn");
  const inputText = panel.querySelector(".input-text");
  const randomTextBtn = panel.querySelector(".random-text-btn");
  const solveBtn = panel.querySelector(".solve-btn");

  randomizeBtn.addEventListener("click", () => {
    let key;
    do {
      key = randomKey(cipherSelect.value);
    } while (key === keyInput.value);
    keyInput.value = key;
    keyInput.dispatchEvent(new Event("input"));
  });

  randomTextBtn.addEventListener("click", () => {
    let text;
    do {
      text = randomPlaintext();
    } while (text === inputText.value);
    inputText.value = text;
    inputText.dispatchEvent(new Event("input"));
  });

  // Load random quote and key on startup
  inputText.value = randomPlaintext();
  keyInput.value = randomKey(cipherSelect.value);

  initCaesar(panel);

  const attackPanel = initAttackPanel(panel);

  solveBtn.addEventListener("click", () => {
    const currentText = panel._getCurrentText?.();
    if (!currentText) return;
    attackPanel.startSolve(currentText);
  });
});
```

- [ ] **Step 3: Verify in browser**

1. Open `index.html`
2. Click Encrypt to encrypt the text
3. Click Solve
4. The attack panel should appear below the workspace
5. The mapping table should populate with cipher characters
6. The sparkline should start drawing
7. Grid cells should update with decoded guesses and green highlighting
8. Play/Pause/Step buttons should work

- [ ] **Step 4: Commit**

```bash
git add js/attack-panel.js js/main.js
git commit -m "feat: add attack panel UI with mapping table, sparkline, and solve controls"
```

---

## Task 6: Polish and Edge Cases

**Files:**
- Modify: `js/attack-panel.js`
- Modify: `css/style.css`

Handle edge cases and visual polish.

- [ ] **Step 1: Reset attack panel when user changes plaintext or re-encrypts**

In `js/attack-panel.js`, update the `initAttackPanel` return to also expose an `onTextChange` callback. Then in `js/main.js`, call `attackPanel.reset()` when the user types in the textarea or clicks Encrypt.

Add to `js/main.js`, after the `attackPanel` initialization:

```js
  inputText.addEventListener("input", () => attackPanel.reset());
  panel.querySelector(".encrypt-btn").addEventListener("click", () => attackPanel.reset());
```

- [ ] **Step 2: Handle the "FAILED" state visually**

In `js/attack-panel.js`, inside `processStep`, after the `if (data.phase === "SOLVED" || data.phase === "FAILED")` block, add special handling for FAILED:

Add to `processStep`, before the final `stop()` call in the SOLVED/FAILED check:

```js
    if (data.phase === "FAILED") {
      stateLabel.style.color = "var(--danger)";
    } else {
      stateLabel.style.color = "";
    }
```

And in `reset()`, add:
```js
    stateLabel.style.color = "";
```

- [ ] **Step 3: Hide attack panel with `hidden` attribute on reset**

In `js/attack-panel.js`, inside `reset()`, add:
```js
    attackPanel.hidden = true;
```

- [ ] **Step 4: Verify full flow in browser**

1. Load page, encrypt text, click Solve — panel appears, animation runs
2. While solving, click Pause — animation stops, Step button enables
3. Click Step — one iteration advances
4. Click Play — resumes
5. Change plaintext text — attack panel resets and hides
6. Click Encrypt then Solve again — fresh solve starts

- [ ] **Step 5: Commit**

```bash
git add js/attack-panel.js js/main.js css/style.css
git commit -m "feat: add attack panel reset on text change and failed state styling"
```
