import { createSolverIterator, findEnglishSpans, countFrequencies } from "./solver.js";
import { createVigenereSolverIterator } from "./vigenere-solver.js";
import { createProductSolverIterator } from "./product-solver.js";
import { createLuciferSolverIterator } from "./lucifer-solver.js";

export function initAttackPanel(panel) {
  // Query all DOM elements from the attack panel HTML
  const attackPanel = panel.querySelector(".attack-panel");
  const cipherRow = panel.querySelector(".mapping-row-cipher");
  const plainRow = panel.querySelector(".mapping-row-plain");
  const scoreCanvas = panel.querySelector(".score-canvas");
  const scoreValue = panel.querySelector(".score-value");
  const stateLabel = panel.querySelector(".attack-state");
  const playBtn = panel.querySelector(".attack-play-btn");
  const stepBtn = panel.querySelector(".attack-step-btn");
  const speedSlider = panel.querySelector(".attack-speed");
  const speedValueLabel = panel.querySelector(".attack-speed-value");
  const iterLabel = panel.querySelector(".attack-iter");
  const gridContainer = panel.querySelector(".text-grid");

  // Mapping-table wrap (mono-alphabetic render mode)
  const mappingTableWrap = panel.querySelector(".mapping-table-wrap");
  const scoreTrackWrap = panel.querySelector(".score-track-wrap");
  const attackBody = panel.querySelector(".attack-body");

  let mode = "substitution";       // "substitution" | "vigenere" | "product" | "lucifer"
  let vigenereWrap = null;         // container for .ioc-chart + .key-row
  let iocChart = null;             // DOM element
  let keyRow = null;               // DOM element
  let iocBarEls = [];              // array of .ioc-bar elements, indexed by length-1
  let keyCellEls = [];             // array of .key-cell elements, indexed by column

  // Product cipher render mode reuses .ioc-chart (width candidates) and
  // .key-row (column read-out order), and keeps the mapping table visible.
  let productWrap = null;
  let productWidthChart = null;
  let productOrderRow = null;
  let productWidthBarEls = [];
  let productOrderCellEls = [];

  // Mini-Lucifer render mode shows the DDT heatmap, the vote histogram across
  // K_4 candidates, and the recovered round-key/master-key result.
  let luciferWrap = null;
  let luciferDdtGrid = null;
  let luciferDdtCells = [];        // length 256, indexed [Δin*16 + Δout]
  let luciferVoteChart = null;
  let luciferVoteBars = [];        // length 256, one bar per K_4 candidate
  let luciferResult = null;        // result card element
  let luciferStatus = null;        // status banner element

  let iterator = null;
  let playing = false;
  let animFrameId = null;
  let cipherChars = [];   // sorted by frequency
  let cipherCells = {};   // char -> DOM element in cipher row
  let plainCells = {};    // char -> DOM element in plain row
  let scoreHistory = [];
  let currentPhase = "IDLE";
  let currentIteration = 0;
  let currentTotalIterations = 0;
  let lastCiphertext = null;
  let lastOptions = null;
  let stepAccumulator = 0;
  const MAX_SCORE_POINTS = 240;
  let sparklineResizeObserver = null;

  function speedMultiplier() {
    const exp = Number.parseInt(speedSlider?.value ?? "2", 10);
    return Math.pow(10, Number.isNaN(exp) ? 2 : exp);
  }

  function stepsPerFrame() {
    // "1×" is the watchable preset — scale it to ~6 steps/sec so REFINING
    // is visibly distinct on fast-converging ciphers (Caesar, Vigenère).
    const m = speedMultiplier();
    return m === 1 ? 0.1 : m;
  }

  function updateSpeedLabel() {
    if (speedValueLabel) speedValueLabel.textContent = `${speedMultiplier()}×`;
  }

  function updateIterLabel() {
    if (!iterLabel) return;
    const iter = currentIteration.toLocaleString();
    if (currentTotalIterations > 0) {
      iterLabel.textContent = `iter ${iter} / ${currentTotalIterations.toLocaleString()}`;
    } else {
      iterLabel.textContent = `iter ${iter}`;
    }
  }

  speedSlider?.addEventListener("input", updateSpeedLabel);
  updateSpeedLabel();

  // --- Mapping table ---

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
      pCell.textContent = "\u00B7"; // middle dot placeholder
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
        pCell.addEventListener("animationend", () => {
          pCell.dataset.state = "tentative";
        }, { once: true });
      } else {
        pCell.dataset.state = "tentative";
      }
    }
  }

  // --- Vigenère render mode (stubs — filled in Task 6) ---

  function buildVigenereUI() {
    attackBody.dataset.mode = "vigenere";
    if (mappingTableWrap) mappingTableWrap.hidden = true;

    vigenereWrap = document.createElement("div");
    vigenereWrap.className = "vigenere-wrap";

    const iocWrap = document.createElement("div");
    iocWrap.className = "ioc-wrap";

    const iocHeading = document.createElement("h4");
    iocHeading.className = "panel-heading";
    iocHeading.textContent = "Key length (IoC)";
    iocWrap.appendChild(iocHeading);

    iocChart = document.createElement("div");
    iocChart.className = "ioc-chart";
    iocWrap.appendChild(iocChart);

    vigenereWrap.appendChild(iocWrap);

    const keyWrap = document.createElement("div");
    keyWrap.className = "key-wrap";

    const keyHeading = document.createElement("h4");
    keyHeading.className = "panel-heading";
    keyHeading.textContent = "Key";
    keyWrap.appendChild(keyHeading);

    keyRow = document.createElement("div");
    keyRow.className = "key-row";
    keyWrap.appendChild(keyRow);

    vigenereWrap.appendChild(keyWrap);

    attackBody.insertBefore(vigenereWrap, attackBody.firstChild);

    iocBarEls = [];
    keyCellEls = [];
  }

  function ensureIocBars(iocBars) {
    if (!iocChart) return;
    if (iocBarEls.length === iocBars.length) return;

    iocChart.innerHTML = "";
    iocBarEls = [];
    for (const entry of iocBars) {
      const bar = document.createElement("div");
      bar.className = "ioc-bar";
      bar.dataset.state = "computing";

      const fill = document.createElement("div");
      fill.className = "ioc-bar-fill";
      bar.appendChild(fill);

      const label = document.createElement("span");
      label.className = "ioc-bar-label";
      label.textContent = String(entry.length);
      bar.appendChild(label);

      iocChart.appendChild(bar);
      iocBarEls.push(bar);
    }
  }

  function ensureKeyCells(keyLength) {
    if (!keyRow) return;
    if (keyCellEls.length === keyLength) return;

    keyRow.innerHTML = "";
    keyCellEls = [];
    for (let i = 0; i < keyLength; i++) {
      const cell = document.createElement("span");
      cell.className = "key-cell";
      cell.textContent = "·";
      cell.dataset.state = "empty";
      keyRow.appendChild(cell);
      keyCellEls.push(cell);
    }
  }

  function updateVigenereUI(data) {
    const bars = data.iocBars ?? [];
    ensureIocBars(bars);
    const maxIoc = bars.reduce((m, b) => Math.max(m, b.ioc), 0) || 1;
    for (let i = 0; i < bars.length; i++) {
      const el = iocBarEls[i];
      if (!el) continue;
      const fill = el.firstElementChild;
      const height = Math.max(2, Math.round((bars[i].ioc / maxIoc) * 100));
      fill.style.height = `${height}%`;
      el.dataset.state = bars[i].status;
    }

    const key = data.key ?? [];
    if (key.length > 0) ensureKeyCells(key.length);

    for (let i = 0; i < keyCellEls.length; i++) {
      const cell = keyCellEls[i];
      const ch = key[i];

      if (ch === null || ch === undefined) {
        cell.textContent = "·";
        cell.dataset.state = "empty";
        continue;
      }

      const previous = cell.textContent;
      cell.textContent = ch;

      if (data.phase === "SOLVED") {
        cell.dataset.state = "locked";
      } else if (data.phase === "REFINING" && previous !== ch) {
        cell.dataset.state = "swapping";
        cell.addEventListener("animationend", () => {
          cell.dataset.state = "tentative";
        }, { once: true });
      } else {
        cell.dataset.state = "tentative";
      }
    }
  }

  function teardownVigenereUI() {
    if (vigenereWrap) {
      vigenereWrap.remove();
      vigenereWrap = null;
    }
    iocChart = null;
    keyRow = null;
    iocBarEls = [];
    keyCellEls = [];
    if (mappingTableWrap) mappingTableWrap.hidden = false;
    if (attackBody.dataset.mode === "vigenere") {
      attackBody.dataset.mode = "substitution";
    }
  }

  // --- Product render mode ---

  function buildProductUI(ciphertext) {
    attackBody.dataset.mode = "product";
    // Substitution mapping table stays — it's half the cipher.
    buildMappingTable(ciphertext);

    productWrap = document.createElement("div");
    productWrap.className = "product-wrap";

    const widthBlock = document.createElement("div");
    widthBlock.className = "ioc-wrap";
    const widthHeading = document.createElement("h4");
    widthHeading.className = "panel-heading";
    widthHeading.textContent = "Transposition width";
    widthBlock.appendChild(widthHeading);
    productWidthChart = document.createElement("div");
    productWidthChart.className = "ioc-chart";
    widthBlock.appendChild(productWidthChart);
    productWrap.appendChild(widthBlock);

    const orderBlock = document.createElement("div");
    orderBlock.className = "key-wrap";
    const orderHeading = document.createElement("h4");
    orderHeading.className = "panel-heading";
    orderHeading.textContent = "Column order";
    orderBlock.appendChild(orderHeading);
    productOrderRow = document.createElement("div");
    productOrderRow.className = "key-row";
    orderBlock.appendChild(productOrderRow);
    productWrap.appendChild(orderBlock);

    attackBody.insertBefore(productWrap, attackBody.firstChild);
    productWidthBarEls = [];
    productOrderCellEls = [];
  }

  function ensureProductWidthBars(bars) {
    if (!productWidthChart) return;
    if (productWidthBarEls.length === bars.length) return;

    productWidthChart.innerHTML = "";
    productWidthBarEls = [];
    for (const entry of bars) {
      const bar = document.createElement("div");
      bar.className = "ioc-bar";
      bar.dataset.state = "computing";
      const fill = document.createElement("div");
      fill.className = "ioc-bar-fill";
      bar.appendChild(fill);
      const label = document.createElement("span");
      label.className = "ioc-bar-label";
      label.textContent = String(entry.width);
      bar.appendChild(label);
      productWidthChart.appendChild(bar);
      productWidthBarEls.push(bar);
    }
  }

  function ensureProductOrderCells(width) {
    if (!productOrderRow) return;
    if (productOrderCellEls.length === width) return;

    productOrderRow.innerHTML = "";
    productOrderCellEls = [];
    for (let i = 0; i < width; i++) {
      const cell = document.createElement("span");
      cell.className = "key-cell";
      cell.textContent = "·";
      cell.dataset.state = "empty";
      productOrderRow.appendChild(cell);
      productOrderCellEls.push(cell);
    }
  }

  function updateProductUI(data) {
    const bars = data.widthBars ?? [];
    ensureProductWidthBars(bars);

    if (bars.length > 0) {
      // Scores are log-probabilities (negative). Normalise to a 0..100% bar
      // height by mapping (min..max) across the visible bars.
      let minScore = Infinity;
      let maxScore = -Infinity;
      for (const b of bars) {
        if (Number.isFinite(b.score)) {
          if (b.score < minScore) minScore = b.score;
          if (b.score > maxScore) maxScore = b.score;
        }
      }
      const range = (maxScore - minScore) || 1;

      for (let i = 0; i < bars.length; i++) {
        const el = productWidthBarEls[i];
        if (!el) continue;
        const fill = el.firstElementChild;
        let pct = Number.isFinite(bars[i].score) ? ((bars[i].score - minScore) / range) * 100 : 0;
        pct = Math.max(4, Math.min(100, pct));
        fill.style.height = `${pct}%`;
        el.dataset.state = bars[i].status;
      }
    }

    const order = data.transOrder ?? [];
    if (order.length > 0) ensureProductOrderCells(order.length);

    for (let i = 0; i < productOrderCellEls.length; i++) {
      const cell = productOrderCellEls[i];
      const idx = order[i];
      if (idx === undefined || idx === null) {
        cell.textContent = "·";
        cell.dataset.state = "empty";
        continue;
      }
      const previous = cell.textContent;
      const text = String(idx + 1);
      cell.textContent = text;

      if (data.phase === "SOLVED") {
        cell.dataset.state = "locked";
      } else if (
        data.swappedColumns &&
        (i === data.swappedColumns[0] || i === data.swappedColumns[1])
      ) {
        cell.dataset.state = "swapping";
        cell.addEventListener("animationend", () => {
          cell.dataset.state = "tentative";
        }, { once: true });
      } else if (previous !== text || cell.dataset.state === "empty") {
        cell.dataset.state = "tentative";
      }
    }

    if (data.mapping) {
      updateMappingTable(data.mapping, data.phase, data.swappedPair, data.accepted);
    }
  }

  function teardownProductUI() {
    if (productWrap) {
      productWrap.remove();
      productWrap = null;
    }
    productWidthChart = null;
    productOrderRow = null;
    productWidthBarEls = [];
    productOrderCellEls = [];
    if (attackBody.dataset.mode === "product") {
      attackBody.dataset.mode = "substitution";
    }
  }

  // --- Mini-Lucifer render mode ---

  function buildLuciferUI() {
    attackBody.dataset.mode = "lucifer";
    if (mappingTableWrap) mappingTableWrap.hidden = true;
    if (scoreTrackWrap) scoreTrackWrap.hidden = true;

    luciferWrap = document.createElement("div");
    luciferWrap.className = "lucifer-wrap";

    luciferStatus = document.createElement("div");
    luciferStatus.className = "lucifer-status";
    luciferStatus.textContent =
      "Differential cryptanalysis assumes a chosen-plaintext oracle. " +
      "The solver simulates that oracle by reusing your key.";
    luciferWrap.appendChild(luciferStatus);

    // DDT heatmap: 16x16 grid of S-box differential counts -- a compact
    // reference tile, not a centerpiece. The chosen characteristic
    // (Δin=0xB → Δout=0x2) is marked.
    const ddtBlock = document.createElement("div");
    ddtBlock.className = "lucifer-block";
    ddtBlock.dataset.block = "ddt";

    luciferDdtGrid = document.createElement("div");
    luciferDdtGrid.className = "lucifer-ddt";
    luciferDdtCells = [];
    // Header row: Δout labels
    luciferDdtGrid.appendChild(makeDdtCorner());
    for (let dout = 0; dout < 16; dout++) {
      luciferDdtGrid.appendChild(makeDdtHeader(dout, "lucifer-ddt-col"));
    }
    // 16 rows, each with the Δin label then 16 cells
    for (let din = 0; din < 16; din++) {
      luciferDdtGrid.appendChild(makeDdtHeader(din, "lucifer-ddt-row"));
      for (let dout = 0; dout < 16; dout++) {
        const cell = document.createElement("span");
        cell.className = "lucifer-ddt-cell";
        if (din === 0xb && dout === 0x2) cell.dataset.target = "true";
        luciferDdtGrid.appendChild(cell);
        luciferDdtCells.push(cell);
      }
    }
    ddtBlock.appendChild(luciferDdtGrid);
    luciferWrap.appendChild(ddtBlock);

    // Vote histogram: 256 bars, one per K_4 candidate.
    const voteBlock = document.createElement("div");
    voteBlock.className = "lucifer-block";
    const voteHeading = document.createElement("h4");
    voteHeading.className = "panel-heading";
    voteHeading.textContent = "K₄ votes (256 candidates)";
    voteBlock.appendChild(voteHeading);

    luciferVoteChart = document.createElement("div");
    luciferVoteChart.className = "lucifer-votes";
    luciferVoteBars = [];
    for (let k = 0; k < 256; k++) {
      const bar = document.createElement("span");
      bar.className = "lucifer-vote-bar";
      bar.dataset.hi = ((k >>> 4) & 0xf).toString(16);
      luciferVoteChart.appendChild(bar);
      luciferVoteBars.push(bar);
    }
    voteBlock.appendChild(luciferVoteChart);
    luciferWrap.appendChild(voteBlock);

    // Result card: recovered K_4 hi nibble + master key + decoded preview.
    luciferResult = document.createElement("div");
    luciferResult.className = "lucifer-result";
    luciferResult.innerHTML =
      '<span class="lucifer-result-label">Phase</span>' +
      '<span class="lucifer-result-value" data-field="phase">IDLE</span>' +
      '<span class="lucifer-result-label">K₄ hi nibble</span>' +
      '<span class="lucifer-result-value" data-field="k4hi">·</span>' +
      '<span class="lucifer-result-label">Recovered key</span>' +
      '<span class="lucifer-result-value" data-field="key">·</span>';
    luciferWrap.appendChild(luciferResult);

    attackBody.insertBefore(luciferWrap, attackBody.firstChild);
  }

  function makeDdtCorner() {
    const c = document.createElement("span");
    c.className = "lucifer-ddt-corner";
    c.textContent = "Δ";
    return c;
  }

  function makeDdtHeader(value, cls) {
    const c = document.createElement("span");
    c.className = `lucifer-ddt-header ${cls}`;
    c.textContent = value.toString(16).toUpperCase();
    return c;
  }

  function updateLuciferUI(data) {
    // DDT — paint once on the first event that carries it.
    if (data.ddt && luciferDdtCells.length === 256 && !luciferDdtGrid.dataset.painted) {
      for (let din = 0; din < 16; din++) {
        for (let dout = 0; dout < 16; dout++) {
          const count = data.ddt[din][dout];
          const cell = luciferDdtCells[din * 16 + dout];
          // Skip the trivial Δin=0 row (always 16 at Δout=0).
          const intensity = din === 0 ? 0 : Math.min(count / 8, 1);
          cell.style.background = intensity > 0
            ? `rgba(0, 232, 122, ${0.08 + intensity * 0.55})`
            : "";
          if (count > 0) cell.title = `Δ${din.toString(16).toUpperCase()} → Δ${dout.toString(16).toUpperCase()}: ${count}/16`;
        }
      }
      luciferDdtGrid.dataset.painted = "true";
    }

    // Vote histogram.
    if (data.votes && luciferVoteBars.length === 256) {
      let maxV = 0;
      for (const v of data.votes) if (v > maxV) maxV = v;
      const denom = maxV || 1;
      const hiVotes = data.hiVotes;
      let topHi = -1;
      if (hiVotes) {
        let best = -1;
        for (let i = 0; i < hiVotes.length; i++) {
          if (hiVotes[i] > best) { best = hiVotes[i]; topHi = i; }
        }
      } else if (typeof data.bestK4 === "number") {
        topHi = (data.bestK4 >>> 4) & 0xf;
      }
      for (let k = 0; k < 256; k++) {
        const bar = luciferVoteBars[k];
        const v = data.votes[k];
        bar.style.height = `${(v / denom) * 100}%`;
        bar.dataset.state = ((k >>> 4) & 0xf) === topHi ? "leader" : "default";
      }
    }

    // Result card.
    if (luciferResult) {
      luciferResult.querySelector('[data-field="phase"]').textContent = data.phase ?? "—";
      const k4hi =
        typeof data.bestK4 === "number"
          ? ((data.bestK4 >>> 4) & 0xf).toString(16).toUpperCase()
          : "·";
      luciferResult.querySelector('[data-field="k4hi"]').textContent = k4hi;
      luciferResult.querySelector('[data-field="key"]').textContent =
        data.recoveredKey ??
        (typeof data.masterKey === "number"
          ? data.masterKey.toString(16).padStart(4, "0")
          : "·");
    }

    // When the solver transitions from hex display to recovered plaintext, the
    // text-grid still has cells from the (longer) hex ciphertext. Trim trailing
    // cells so the result reads as clean plaintext, not "plaintext... + dead hex".
    if (
      (data.phase === "PEELING" || data.phase === "SOLVED") &&
      typeof data.decoded === "string"
    ) {
      const spans = gridContainer.querySelectorAll(".cell");
      for (let i = data.decoded.length; i < spans.length; i++) {
        spans[i].textContent = "";
        delete spans[i].dataset.solve;
        delete spans[i].dataset.english;
      }
    }

    // Status banner: mirror the current sub-phase so the pedagogy is legible.
    if (luciferStatus) {
      let detail = "";
      if (data.phase === "ANALYZING") {
        detail = "Computing the S-box DDT and pinning the 3-round characteristic.";
      } else if (data.phase === "SAMPLING") {
        detail = `Generating chosen-plaintext pairs through the oracle (${data.pairsCollected ?? 0} / ${data.totalPairs ?? "?"}).`;
      } else if (data.phase === "VOTING") {
        detail = `Voting K₄ candidates (${data.votedSoFar ?? 0} / 256). High-vote ridges share a K₄ high nibble.`;
      } else if (data.phase === "PEELING") {
        const progress = typeof data.peelProgress === "number" && typeof data.peelTotal === "number"
          ? ` — trying ${data.peelProgress.toLocaleString()} / ${data.peelTotal.toLocaleString()}`
          : "";
        const tryKey = typeof data.currentTryKey === "number"
          ? ` [key 0x${data.currentTryKey.toString(16).padStart(4, "0")}]`
          : "";
        detail = `Brute-forcing the remaining 12 master-key bits under the top K₄ high-nibble guess (candidate ${data.candidateRank ?? 1} / 3)${progress}${tryKey}.`;
      } else if (data.phase === "SOLVED") {
        detail = "Master key recovered. Decryption matches printable English.";
      } else if (data.phase === "FAILED") {
        detail = "Could not lock onto a master key — increase pair count, or the input may not be Mini-Lucifer.";
      }
      luciferStatus.dataset.phase = data.phase ?? "";
      luciferStatus.textContent = detail
        ? detail
        : "Differential cryptanalysis assumes a chosen-plaintext oracle. The solver simulates that oracle by reusing your key.";
    }
  }

  function teardownLuciferUI() {
    if (luciferWrap) {
      luciferWrap.remove();
      luciferWrap = null;
    }
    luciferDdtGrid = null;
    luciferDdtCells = [];
    luciferVoteChart = null;
    luciferVoteBars = [];
    luciferResult = null;
    luciferStatus = null;
    if (mappingTableWrap) mappingTableWrap.hidden = false;
    if (scoreTrackWrap) scoreTrackWrap.hidden = false;
    if (attackBody.dataset.mode === "lucifer") {
      attackBody.dataset.mode = "substitution";
    }
  }

  // --- Score sparkline (canvas) ---

  function drawSparkline() {
    const ctx = scoreCanvas.getContext("2d");
    if (!ctx) return;

    const rect = scoreCanvas.getBoundingClientRect();
    const w = Math.max(rect.width, scoreCanvas.clientWidth, scoreCanvas.offsetWidth, 1);
    const h = Math.max(rect.height, scoreCanvas.clientHeight, scoreCanvas.offsetHeight, 1);
    const scale = window.devicePixelRatio || 1;

    scoreCanvas.width = Math.max(1, Math.round(w * scale));
    scoreCanvas.height = Math.max(1, Math.round(h * scale));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(scale, scale);

    ctx.clearRect(0, 0, w, h);

    const history = scoreHistory
      .slice(-MAX_SCORE_POINTS)
      .filter((entry) => Number.isFinite(entry.score));
    if (history.length === 0) return;

    const scores = history.map((s) => s.score);
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const range = max - min || 1;
    const xStep = history.length > 1 ? w / (history.length - 1) : 0;

    const pointFor = (index) => ({
      x: history.length > 1 ? index * xStep : w / 2,
      y: h - ((scores[index] - min) / range) * (h - 8) - 4,
    });

    if (history.length === 1) {
      const point = pointFor(0);
      ctx.beginPath();
      ctx.fillStyle = "#00e87a";
      ctx.arc(point.x, point.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    // Green line
    ctx.beginPath();
    ctx.strokeStyle = "#00e87a";
    ctx.lineWidth = 1.5;
    ctx.shadowColor = "#00e87a40";
    ctx.shadowBlur = 4;

    for (let i = 0; i < history.length; i++) {
      const { x, y } = pointFor(i);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Red dots for rejected swaps
    ctx.fillStyle = "#ff4d4d";
    for (let i = 0; i < history.length; i++) {
      if (history[i].accepted === false) {
        const { x, y } = pointFor(i);
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function attachSparklineResizeObserver() {
    if (sparklineResizeObserver || typeof ResizeObserver !== "function") return;
    sparklineResizeObserver = new ResizeObserver(() => {
      if (!attackPanel.hidden) drawSparkline();
    });
    sparklineResizeObserver.observe(scoreCanvas);
  }

  // --- Grid highlighting ---

  function updateGridHighlighting(decoded, phase) {
    const spans = gridContainer.querySelectorAll(".cell");
    const englishMarks = findEnglishSpans(decoded);

    for (let i = 0; i < spans.length && i < decoded.length; i++) {
      spans[i].textContent = decoded[i];

      if (phase === "SOLVED") {
        spans[i].dataset.solve = "locked";
      } else {
        spans[i].dataset.solve = "tentative";
      }

      if (englishMarks[i]) {
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
    currentPhase = state;
    stateLabel.textContent = state;
  }

  function processStep(step) {
    if (step.done) {
      stop();
      return;
    }

    const data = step.value;
    setState(data.phase);

    if (mode === "vigenere") {
      updateVigenereUI(data);
    } else if (mode === "product") {
      updateProductUI(data);
    } else if (mode === "lucifer") {
      updateLuciferUI(data);
    } else {
      updateMappingTable(data.mapping, data.phase, data.swappedPair, data.accepted);
    }

    if (Number.isFinite(data.score)) {
      scoreHistory.push({ score: data.score, accepted: data.accepted });
    }
    if (scoreHistory.length > MAX_SCORE_POINTS * 2) {
      scoreHistory = scoreHistory.slice(-MAX_SCORE_POINTS);
    }
    scoreValue.textContent = Number.isFinite(data.score) ? String(Math.round(data.score)) : "n/a";
    drawSparkline();

    if (typeof data.iteration === "number") currentIteration = data.iteration;
    if (typeof data.totalIterations === "number") currentTotalIterations = data.totalIterations;
    updateIterLabel();

    if (data.decoded) updateGridHighlighting(data.decoded, data.phase);

    if (data.phase === "SOLVED" || data.phase === "FAILED") {
      if (data.phase === "FAILED") {
        stateLabel.style.color = "var(--danger)";
      } else {
        stateLabel.style.color = "";
      }
      stop();
    }
  }

  // --- Controls ---

  function autoStep() {
    if (!playing || !iterator) return;

    // At 1× every phase is throttled (ANALYZING/MAPPING/DECODING would otherwise
    // blast at 60 steps/sec). At higher speeds, iterative search phases scale
    // with the slider so long-running passes don't stall.
    let stepsThisFrame;
    if (speedMultiplier() === 1) {
      stepAccumulator += stepsPerFrame();
      stepsThisFrame = Math.floor(stepAccumulator);
      stepAccumulator -= stepsThisFrame;
    } else if (
      currentPhase === "DECODING" ||
      currentPhase === "REFINING" ||
      currentPhase === "REFINING_TRANS" ||
      currentPhase === "REFINING_SUBST" ||
      currentPhase === "PEELING" ||
      currentPhase === "SAMPLING" ||
      currentPhase === "VOTING"
    ) {
      stepsThisFrame = stepsPerFrame();
    } else {
      stepsThisFrame = 1;
    }

    // Run multiple solver steps per frame, only render the last one
    let lastStep = null;
    for (let i = 0; i < stepsThisFrame; i++) {
      const step = iterator.next();
      if (step.done) break;
      lastStep = step;
      if (step.value?.phase === "SOLVED" || step.value?.phase === "FAILED") break;
    }

    if (lastStep) {
      processStep(lastStep);
      if (lastStep.value?.phase === "SOLVED" || lastStep.value?.phase === "FAILED") return;
    } else if (stepsThisFrame > 0) {
      stop();
      return;
    }

    animFrameId = requestAnimationFrame(autoStep);
  }

  function play() {
    playing = true;
    playBtn.innerHTML = "&#9208;"; // pause icon
    stepBtn.disabled = true;
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
    stepBtn.disabled = true;
    // Leave playBtn enabled so it can restart the solver on the last ciphertext.
  }

  function reset(options = {}) {
    const { hide = true } = options;

    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
    playing = false;
    iterator = null;
    scoreHistory = [];
    currentPhase = "IDLE";
    currentIteration = 0;
    currentTotalIterations = 0;
    lastCiphertext = null;
    lastOptions = null;
    stepAccumulator = 0;
    updateIterLabel();
    playBtn.innerHTML = "&#9654;";
    playBtn.disabled = false;
    stepBtn.disabled = true;
    stateLabel.style.color = "";
    if (hide) attackPanel.hidden = true;
    setState("IDLE");
    attackBody.dataset.mode = "substitution";
    scoreValue.textContent = "0";
    cipherRow.innerHTML = "";
    plainRow.innerHTML = "";

    const ctx = scoreCanvas.getContext("2d");
    ctx.clearRect(0, 0, scoreCanvas.width, scoreCanvas.height);

    const spans = gridContainer.querySelectorAll(".cell");
    for (const span of spans) {
      delete span.dataset.solve;
      delete span.dataset.english;
    }

    teardownVigenereUI();
    teardownProductUI();
    teardownLuciferUI();
  }

  playBtn.addEventListener("click", () => {
    if ((currentPhase === "SOLVED" || currentPhase === "FAILED") && lastCiphertext) {
      startSolve(lastCiphertext, lastOptions ?? {});
      return;
    }
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

  function startSolve(ciphertext, options = {}) {
    panel._stopGridAnimation?.();
    reset();
    panel._showCiphertext?.({ animate: false, force: true });
    // The solver will overwrite the grid DOM with decoded text as it runs, so
    // the ciphertext-display cache is about to go stale — invalidate it now
    // so a subsequent Encrypt click actually re-renders the grid.
    panel._invalidateDisplayCache?.();
    lastCiphertext = ciphertext;
    lastOptions = options;
    attackPanel.hidden = false;
    attachSparklineResizeObserver();
    requestAnimationFrame(() => {
      if (!attackPanel.hidden) drawSparkline();
    });

    if (options.cipherType === "vigenere") {
      mode = "vigenere";
    } else if (options.cipherType === "product") {
      mode = "product";
    } else if (options.cipherType === "lucifer") {
      mode = "lucifer";
    } else {
      mode = "substitution";
    }

    if (mode === "vigenere") {
      buildVigenereUI();
      iterator = createVigenereSolverIterator(ciphertext);
    } else if (mode === "product") {
      buildProductUI(ciphertext);
      iterator = createProductSolverIterator(ciphertext, options);
    } else if (mode === "lucifer") {
      buildLuciferUI();
      iterator = createLuciferSolverIterator(ciphertext, options);
    } else {
      buildMappingTable(ciphertext);
      iterator = createSolverIterator(ciphertext, options);
    }
    stepBtn.disabled = false;
    setState("ANALYZING");

    const firstStep = iterator.next();
    processStep(firstStep);

    if (!firstStep.done && firstStep.value?.phase !== "SOLVED" && firstStep.value?.phase !== "FAILED") {
      play();
    }
  }

  // --- Public API ---

  return {
    startSolve,
    reset,
  };
}
