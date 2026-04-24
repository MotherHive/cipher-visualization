import { createSolverIterator, findEnglishSpans, countFrequencies } from "./solver.js";
import { createVigenereSolverIterator } from "./vigenere-solver.js";

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
  const attackBody = panel.querySelector(".attack-body");

  let mode = "substitution";       // "substitution" | "vigenere"
  let vigenereWrap = null;         // container for .ioc-chart + .key-row
  let iocChart = null;             // DOM element
  let keyRow = null;               // DOM element
  let iocBarEls = [];              // array of .ioc-bar elements, indexed by length-1
  let keyCellEls = [];             // array of .key-cell elements, indexed by column

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
    // blast at 60 steps/sec). At higher speeds only REFINING scales; setup phases
    // stay at 1/frame so they don't artificially stall.
    let stepsThisFrame;
    if (speedMultiplier() === 1) {
      stepAccumulator += stepsPerFrame();
      stepsThisFrame = Math.floor(stepAccumulator);
      stepAccumulator -= stepsThisFrame;
    } else if (currentPhase === "REFINING") {
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

    mode = options.cipherType === "vigenere" ? "vigenere" : "substitution";

    if (mode === "vigenere") {
      buildVigenereUI();
      iterator = createVigenereSolverIterator(ciphertext);
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
