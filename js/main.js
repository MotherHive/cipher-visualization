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
