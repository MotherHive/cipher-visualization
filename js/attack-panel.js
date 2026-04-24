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
  const MAX_SCORE_POINTS = 240;

  function stepsPerFrame() {
    const exp = Number.parseInt(speedSlider?.value ?? "2", 10);
    return Math.pow(10, Number.isNaN(exp) ? 2 : exp);
  }

  function updateSpeedLabel() {
    if (speedValueLabel) speedValueLabel.textContent = `${stepsPerFrame()}×`;
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
    // Stub: leave mapping table visible for now; Task 6 replaces with IoC chart
    // and key row. This stub keeps the panel from crashing when Vigenère runs.
    iocBarEls = [];
    keyCellEls = [];
  }

  function updateVigenereUI(/* step */) {
    // Stub: no-op until Task 6.
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

    const history = scoreHistory.slice(-MAX_SCORE_POINTS);
    if (history.length < 2) return;

    const scores = history.map((s) => s.score);
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const range = max - min || 1;

    // Green line
    ctx.beginPath();
    ctx.strokeStyle = "#00e87a";
    ctx.lineWidth = 1.5;
    ctx.shadowColor = "#00e87a40";
    ctx.shadowBlur = 4;

    const xStep = w / Math.max(history.length - 1, 1);

    for (let i = 0; i < history.length; i++) {
      const x = i * xStep;
      const y = h - ((scores[i] - min) / range) * (h - 8) - 4;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Red dots for rejected swaps
    ctx.fillStyle = "#ff4d4d";
    for (let i = 0; i < history.length; i++) {
      if (history[i].accepted === false) {
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

    scoreHistory.push({ score: data.score, accepted: data.accepted });
    if (scoreHistory.length > MAX_SCORE_POINTS * 2) {
      scoreHistory = scoreHistory.slice(-MAX_SCORE_POINTS);
    }
    scoreValue.textContent = Math.round(data.score);
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

    const stepsThisFrame = currentPhase === "REFINING" ? stepsPerFrame() : 1;

    // Run multiple solver steps per frame, only render the last one
    let lastStep = null;
    for (let i = 0; i < stepsThisFrame; i++) {
      const step = iterator.next();
      lastStep = step;
      if (step.done || step.value?.phase === "SOLVED") break;
    }

    if (lastStep) {
      processStep(lastStep);
      if (lastStep.done || lastStep.value?.phase === "SOLVED") return;
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
    currentPhase = "IDLE";
    currentIteration = 0;
    currentTotalIterations = 0;
    updateIterLabel();
    playBtn.innerHTML = "&#9654;";
    playBtn.disabled = false;
    stepBtn.disabled = true;
    stateLabel.style.color = "";
    attackPanel.hidden = true;
    setState("IDLE");
    scoreValue.textContent = "0";

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
    startSolve(ciphertext, options = {}) {
      panel._stopGridAnimation?.();
      reset();
      attackPanel.hidden = false;

      mode = options.cipherType === "vigenere" ? "vigenere" : "substitution";

      if (mode === "vigenere") {
        buildVigenereUI();
        iterator = createVigenereSolverIterator(ciphertext);
      } else {
        buildMappingTable(ciphertext);
        iterator = createSolverIterator(ciphertext, options);
      }
      setState("ANALYZING");

      const firstStep = iterator.next();
      processStep(firstStep);
      stepBtn.disabled = false;

      play();
    },
    reset,
  };
}
