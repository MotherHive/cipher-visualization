# Attack Tooling Panel — Design Spec

## Overview

A new panel below the existing workspace that provides a visual, animated
mapping solver for both Caesar and Substitution ciphers using the same
frequency-analysis + hill-climbing process. The visualization makes both
the frequency-matching intuition and the iterative refinement self-evident
by watching it run.

---

## 1. Layout & Structure

The attack panel is a new row below the existing workspace grid, inside
`.tab-panel`. Hidden by default, appears when the user clicks Solve.

```
┌──────────────────────────────────────────────┐
│  Settings Bar                                │
├──────────────────────┬───────────────────────┤
│  Text Grid (16x16)   │  Frequency Histogram  │
│                      │                       │
│  [Encrypt] [Solve]   │                       │
├──────────────────────┴───────────────────────┤
│  Attack Panel                                │
│  ┌─────────────────────┐ ┌─────────────────┐ │
│  │  Mapping Table       │ │  Score Track    │ │
│  │  (sorted by freq)    │ │  (sparkline)    │ │
│  └─────────────────────┘ └─────────────────┘ │
│  [Play] [Step]  State: IDLE                  │
└──────────────────────────────────────────────┘
```

- Mapping table: ~70% width. Score track: ~30% width.
- Controls and state label in a small toolbar row below.
- Uses same `--bg-surface` card style as other panels.

---

## 2. Mapping Table

A two-row grid showing only characters present in the ciphertext, sorted by
frequency (most frequent first, matching the histogram above).

- **Top row:** Ciphertext characters, each in a fixed-width cell.
- **Bottom row:** Current plaintext guess for that character.

### Cell States

| State     | Visual                                      |
|-----------|---------------------------------------------|
| Empty     | `·` placeholder, `--text-dim`               |
| Tentative | Dark green — initial guess                   |
| Locked    | Light desaturated green — accepted by hill climber |
| Swapping  | Brief pulse animation on the two test cells  |

- When a swap is attempted, the two affected bottom-row cells pulse.
  Accepted: settle into new values. Rejected: snap back.
- For Caesar: once the solver detects a single-shift relationship, all
  mappings lock simultaneously — visually demonstrating that Caesar is a
  trivial case of substitution.

---

## 3. Score Track

A small sparkline chart plotting fitness score over iteration count.

- **X-axis:** Iteration number (implicit, left-to-right progression).
- **Y-axis:** Bigram fitness score (normalized, no visible scale).
- Line drawn in `--accent` green with subtle glow.
- **Accepted swaps:** new point added, line extends right.
- **Rejected swaps:** brief red dot at current position, fades out.
- Auto-scales vertically as score improves.
- Small numeric score label in top-right corner showing current value.

---

## 4. Grid Highlighting

During solve, the 16x16 grid becomes a live partial-decryption readout.

- **Decoded cells:** as mappings are guessed, cells update from ciphertext
  to current plaintext guess. Unsolved cells stay as cipher char in
  `--text-dim`.
- **English highlighting:** cells part of common English bigrams/trigrams
  (TH, HE, IN, THE, AND, etc.) get a subtle green background tint. As
  more text resolves and longer recognizable sequences form, tint gets
  brighter.
- Uses same desaturated/dark green scale as mapping table — darker
  green for tentative decodes, light desaturated green for locked.
- Grid is read-only during solve.

---

## 5. Controls & Solve Flow

Toolbar row at bottom of attack panel:

- **Play button** — starts automatic solve. Toggles to Pause while running.
- **Step button** — advances one iteration (one swap attempt). Only enabled
  when paused.
- **State label** — shows current phase.

### Phases

1. **IDLE** — waiting for user to click Solve.
2. **ANALYZING** — frequency count runs (histogram animates). Mapping table
   populates top row sorted by frequency.
3. **MAPPING** — initial guess: ciphertext chars mapped to English frequency
   order (space, E, T, A, O...). Bottom row fills in with tentative
   (dark green) guesses. Grid updates with partial decode.
   Score track plots first point.
4. **REFINING** — hill climber iterates. Each iteration picks two mappings,
   swaps them, scores the result. If better: accept (cells settle, score
   goes up). If worse: reject (cells snap back, red dot on track). English
   highlighting updates as sequences form.
5. **SOLVED** — score plateaus, all mappings lock to light green. State label
   updates. For Caesar, solver detects uniform shift and locks all mappings
   at once during MAPPING, skipping REFINING.
6. **FAILED** — score can't improve past threshold after max attempts. Grid
   shows "Could not solve." State freezes.

Animation runs at a fixed pace regardless of text length.
Play/Pause works at any point during MAPPING or REFINING.

---

## 6. Solver Algorithm

### Frequency Table

Standard English character frequencies for printable ASCII (32-126).
Space is the most frequent (~18%), then E, T, A, O, I, N, S, H, R...
Digits and punctuation included at expected (low) frequencies.

### Initial Mapping (MAPPING phase)

Sort ciphertext characters by frequency. Sort English expected characters
by frequency. Map 1:1 in order.

### Fitness Function

Log-probability bigram scoring:
- Lookup table of English bigram frequencies (character pairs).
- Sum log-probabilities across all adjacent pairs in decoded text.
- Higher score = more English-like.

### Hill Climbing (REFINING phase)

1. Pick two random mappings.
2. Swap them.
3. Score the new decoding.
4. If score improved: keep the swap.
5. If not: revert.
6. Repeat until score plateaus (no improvement in 500 consecutive attempts).

### Caesar Detection

After initial frequency mapping, check if all mappings share a single
consistent shift value. If yes: lock all mappings immediately, skip to
SOLVED.

### Failure

After maximum iteration count (e.g., 5000), if score is below a minimum
threshold, declare FAILED.

---

## 7. File Structure

New files:
- `js/solver.js` — solver algorithm (frequency mapping, bigram scoring,
  hill climbing, Caesar detection)
- `js/attack-panel.js` — UI rendering and animation for the attack panel
  (mapping table, score track, controls, grid highlighting)

Modified files:
- `index.html` — add attack panel HTML structure
- `css/style.css` — add attack panel styles
- `js/main.js` — wire up Solve button to attack panel
- `js/caesar.js` — expose scrambleReveal and grid update functions for
  the attack panel to drive

---

## 8. Resolved Decisions

- [x] Same solver process for Caesar and Substitution (frequency + hill climb)
- [x] Caesar detected as special case — all mappings lock at once
- [x] Mapping table shows only characters present in ciphertext
- [x] Dark green for tentative guesses, light desaturated green for locked
- [x] Score track as sparkline with red dots for rejected swaps
- [x] Grid highlights likely English sequences with green tint
- [x] Automatic by default with play/pause/step controls
- [x] Attack panel appears below workspace as a new row
- [x] Fixed animation pace regardless of text length
