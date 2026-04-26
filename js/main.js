import { initCaesar } from "./caesar.js";
import { randomKey } from "./keys.js";
import { randomPlaintext } from "./plaintext.js";
import { initAttackPanel } from "./attack-panel.js";
import { DEFAULT_ROUNDS, loadScoringData } from "./solver.js";
import { initTopicTabs } from "./topic-tabs.js";

document.addEventListener("DOMContentLoaded", () => {
  initTopicTabs();

  const panel = document.getElementById("crypto-solver");
  const cipherSelect = panel.querySelector(".cipher-select");
  const keyInput = panel.querySelector(".key-input");
  const cipherInfoBtn = panel.querySelector(".cipher-info-btn");
  const randomizeBtn = panel.querySelector(".randomize-btn");
  const inputText = panel.querySelector(".input-text");
  const randomTextBtn = panel.querySelector(".random-text-btn");
  const solveBtn = panel.querySelector(".solve-btn");
  const encryptBtn = panel.querySelector(".encrypt-btn");
  const roundsInput = panel.querySelector(".rounds-input");

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
  const scoringDataReady = loadScoringData();
  inputText.addEventListener("input", () => attackPanel.reset());
  encryptBtn.addEventListener("click", () => attackPanel.reset({ hide: false }));

  function syncCipherControls() {
    const isCaesar = cipherSelect.value === "caesar";
    if (cipherInfoBtn) cipherInfoBtn.hidden = !isCaesar;
    solveBtn.disabled = false;
    solveBtn.title = "";
    encryptBtn.title = "";
  }

  cipherSelect.addEventListener("input", () => {
    keyInput.value = randomKey(cipherSelect.value);
    keyInput.dispatchEvent(new Event("input"));
    attackPanel.reset();
    syncCipherControls();
  });

  syncCipherControls();

  function currentRounds() {
    const parsed = Number.parseInt(roundsInput?.value ?? "", 10);
    if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_ROUNDS;
    return Math.min(parsed, 50);
  }

  solveBtn.addEventListener("click", async () => {
    const ciphertext = panel._getCiphertext?.() ?? panel._getCurrentText?.();
    if (!ciphertext) return;

    await scoringDataReady;
    attackPanel.startSolve(ciphertext, {
      rounds: currentRounds(),
      cipherType: cipherSelect.value,
    });
  });
});
