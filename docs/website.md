# Cryptography Presentation Site — Layout Plan

## Overview
Single-tab layout. Interactive tool for encrypting text and visually demonstrating
automatic classical cipher decryption. Designed for presentation use — the solve
process is animated and self-running.

---

## 1. Top Section — Settings & Key

- **Cipher Type** — dropdown selector
  - Options: Caesar, Substitution, Vigenère
- **Key Input** — text field for manual key entry
- **Randomize Key** — button with dice icon (🎲) that generates a valid random key
  for the selected cipher type

---

## 2. Left Lower Half — Text Matrix View

### Controls
- **Highlight Repeats** — toggle; highlights repeated characters in the matrix
- **Show Bigrams** — toggle; overlays bigram pair highlighting

### Matrix
- 16×16 grid (256 characters total, fixed)
- All messages padded to 256 characters — matrix is always full
- Full ASCII character set supported, including spaces
- Spaces are treated as meaningful cipher characters, not stripped
- During auto-solve: cells animate in at a fixed pace as mappings commit
  - Confident mappings reveal first; uncertain ones fill in last
  - Unsolved cells shown as dimmed placeholder

### Actions
- **Encrypt Button** — runs the selected cipher on the matrix text
- **Solve Button** — triggers the fully automatic animated decryption sequence

---

## 3. Right Lower Half — Analysis Panel

- **Frequency Histogram** — bar chart of character frequencies in the ciphertext
  - Full ASCII frequency range (not just A–Z)
  - During auto-solve: bars animate as letter mappings shift and lock in
- **English Distribution Overlay** — overlays expected English character frequencies
  for visual comparison (including space as most frequent character)
- **Bigram Score** — numeric score comparing ciphertext bigrams against standard
  English bigram frequencies; updates live during solve

---

## 4. Bottom — Attack Tools

Two modes, selectable via radio buttons. Both run automatically on solve.

---

### 🔘 Frequency Analysis
*Used for: Caesar, Substitution*

#### Auto-Solve Behavior
1. Algorithm ranks ciphertext characters by frequency (full ASCII)
2. Maps them to English frequency order (space, E, T, A, O, I...)
3. Scores the result using bigram fitness
4. Iteratively swaps mappings to climb toward best score
5. Each accepted swap animates in the matrix and histogram simultaneously
6. Runs at a fixed animation pace regardless of text length

#### Failure State
- If the algorithm cannot converge on a valid solution, the matrix halts
  and displays **"Could not solve."** in place of the plaintext
- Histogram and score freeze at last known state

- **Letter Mapping Display** — shows current cipher→plain mapping as solve runs;
  locked mappings highlighted, uncertain ones dimmed
- **Live Partial Decryption** — matrix updates in real time as mappings commit;
  read-only during solve, editable after

---

### 🔘 Vigenère Analysis
*Used for: Vigenère*

#### Auto-Solve Behavior
1. Index of Coincidence (IC) used to detect likely key length
2. Ciphertext split into N columns automatically
3. Each column solved as an independent Caesar cipher
4. Columns merge to reveal full plaintext
5. Runs at a fixed animation pace

#### Failure State
- If key length cannot be determined or columns fail to converge,
  the matrix halts and displays **"Could not solve."**

- **Key Length Detection** — displays IC scores across candidate lengths;
  best candidate highlighted
- **Split Into Columns Visualization** — animates the split as key length locks in
- **Per-Column Frequency** — individual histogram per column, animating as each
  Caesar subproblem solves

#### What this demonstrates
- Periodic structure in repeated-key ciphers
- How Vigenère reduces to multiple Caesar ciphers
- How statistical analysis automates what looks like a hard problem

---

## Solve State Machine
- **IDLE** — waiting for user input
- **ANALYZING** — computing frequency counts and IC scores
- **MAPPING** — initial character assignments made, histogram animates
- **REFINING** — hill-climbing swaps, matrix fills in at fixed pace
- **SOLVED** — all cells revealed, final score displayed; user may now edit
- **FAILED** — algorithm could not converge; matrix displays "Could not solve."

---

## Resolved Decisions

- [x] Animation speed — fixed pace regardless of text length
- [x] Matrix always 16×16 (256 chars); messages padded to fill
- [x] Full ASCII scope — spaces are cipher characters, not stripped
- [x] Solve failure — displays "Could not solve." and freezes state

## Open Questions / TBD

- [ ] Padding character — what fills unused matrix cells? (null, `·`, space?)
- [ ] Color scheme / visual style
- [ ] Mobile layout considerations (future)
- [ ] Multi-tab expansion plan (future)