import { initCaesar } from "./caesar.js";
import { randomKey } from "./keys.js";
import { randomPlaintext } from "./plaintext.js";
import { initAttackPanel } from "./attack-panel.js";
import { loadScoringData } from "./solver.js";

document.addEventListener("DOMContentLoaded", () => {
  const panel = document.getElementById("crypto-solver");
  const cipherSelect = panel.querySelector(".cipher-select");
  const keyInput = panel.querySelector(".key-input");
  const randomizeBtn = panel.querySelector(".randomize-btn");
  const inputText = panel.querySelector(".input-text");
  const randomTextBtn = panel.querySelector(".random-text-btn");
  const solveBtn = panel.querySelector(".solve-btn");
  const encryptBtn = panel.querySelector(".encrypt-btn");

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
  void loadScoringData();
  inputText.addEventListener("input", () => attackPanel.reset());
  encryptBtn.addEventListener("click", () => attackPanel.reset());

  function syncCipherControls() {
    const solverSupported = cipherSelect.value !== "vigenere";
    solveBtn.disabled = !solverSupported;
    solveBtn.title = solverSupported ? "" : "Solver currently supports Caesar and substitution only.";
    encryptBtn.title = solverSupported ? "" : "Encrypt still works for Vigenere, but Solve is disabled.";
  }

  cipherSelect.addEventListener("input", () => {
    keyInput.value = randomKey(cipherSelect.value);
    keyInput.dispatchEvent(new Event("input"));
    attackPanel.reset();
    syncCipherControls();
  });

  syncCipherControls();

  solveBtn.addEventListener("click", () => {
    const ciphertext = panel._getCiphertext?.() ?? panel._getCurrentText?.();
    if (!ciphertext) return;

    panel._showCiphertext?.({ animate: false, force: true });
    attackPanel.startSolve(ciphertext);
  });
});
