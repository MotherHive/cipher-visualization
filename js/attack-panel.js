import { createSolverIterator, findEnglishSpans, countFrequencies } from "./solver.js";

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
  const gridContainer = panel.querySelector(".text-grid");

  let iterator = null;
  let playing = false;
  let animFrameId = null;
  let cipherChars = [];   // sorted by frequency
  let cipherCells = {};   // char -> DOM element in cipher row
  let plainCells = {};    // char -> DOM element in plain row
  let scoreHistory = [];

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
          pCell.dataset.state = accepted ? "locked" : "tentative";
        }, { once: true });
      } else if (pCell.dataset.state !== "locked") {
        pCell.dataset.state = "tentative";
      }
    }
  }

  // --- Score sparkline (canvas) ---

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

    // Green line
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

    // Red dots for rejected swaps
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
      if (data.phase === "FAILED") {
        stateLabel.style.color = "var(--danger)";
      } else {
        stateLabel.style.color = "";
      }
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

      const firstStep = iterator.next();
      processStep(firstStep);
      stepBtn.disabled = false;

      play();
    },
    reset,
  };
}
