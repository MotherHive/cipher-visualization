import { initCaesar } from "./caesar.js";
import { randomKey } from "./keys.js";

document.addEventListener("DOMContentLoaded", () => {
  const panel = document.getElementById("crypto-solver");
  const cipherSelect = panel.querySelector(".cipher-select");
  const keyInput = panel.querySelector(".key-input");
  const randomizeBtn = panel.querySelector(".randomize-btn");
  const slider = panel.querySelector(".shift-slider");

  randomizeBtn.addEventListener("click", () => {
    const key = randomKey(cipherSelect.value);
    keyInput.value = key;

    // For Caesar, sync the slider to match
    if (cipherSelect.value === "caesar") {
      slider.value = parseInt(key);
      slider.dispatchEvent(new Event("input"));
    }
  });

  initCaesar(panel);
});