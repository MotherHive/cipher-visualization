import { initCaesar } from "./caesar.js";
import { randomKey } from "./keys.js";
import { randomPlaintext } from "./plaintext.js";
import { initAttackPanel } from "./attack-panel.js";
import { DEFAULT_ROUNDS, loadScoringData } from "./solver.js";
import { initTopicTabs } from "./topic-tabs.js";
import { initAmbientText } from "./ambient-text.js";
import { parseLuciferKey } from "./lucifer.js";

const CIPHER_INFO = {
  caesar: {
    label: "Caesar implementation note",
    title: "This demo uses a printable-ASCII Caesar shift, not the classic A-Z-only version, so spaces and punctuation move too.",
  },
  substitution: {
    label: "Substitution implementation note",
    title: "This demo substitutes across all printable ASCII characters instead of just A-Z, and lowercase letters are normalized to uppercase before substitution.",
  },
  vigenere: {
    label: "Vigenere implementation note",
    title: "This demo runs Vigenere over printable ASCII rather than A-Z, so spaces and punctuation participate in the repeating-key shifts.",
  },
  product: {
    label: "Product implementation note",
    title: "This demo's product cipher is a toy construction: one columnar transposition followed by one printable-ASCII substitution layer, not a full modern block cipher.",
  },
  lucifer: {
    label: "Mini-Lucifer implementation note",
    title: "This demo's Mini-Lucifer is a teaching-sized 16-bit, 4-round Feistel block cipher with a 16-bit key. Plaintext is paired into 16-bit blocks; ciphertext is shown as hex.",
  },
};

document.addEventListener("DOMContentLoaded", () => {
  initTopicTabs();
  initAmbientText();

  const panel = document.getElementById("crypto-solver");
  const cipherSelect = panel.querySelector(".cipher-select");
  const keyInput = panel.querySelector(".key-input");
  const cipherInfoBtn = panel.querySelector(".cipher-info-btn");
  const cipherInfoTooltip = panel.querySelector(".cipher-info-tooltip");
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
    const cipher = cipherSelect.value;
    const info = CIPHER_INFO[cipher];
    if (cipherInfoBtn) {
      cipherInfoBtn.hidden = !info;
      cipherInfoBtn.setAttribute("aria-label", info?.label ?? "Cipher implementation note");
    }
    if (cipherInfoTooltip) {
      cipherInfoTooltip.textContent = info?.title ?? "";
    }
    if (cipher === "lucifer") {
      const validKey = parseLuciferKey(keyInput.value) !== null;
      solveBtn.disabled = !validKey;
      solveBtn.title = validKey
        ? ""
        : "Mini-Lucifer solver needs a 4-hex-digit key (oracle simulation).";
    } else {
      solveBtn.disabled = false;
      solveBtn.title = "";
    }
    encryptBtn.title = "";
  }

  cipherSelect.addEventListener("input", () => {
    keyInput.value = randomKey(cipherSelect.value);
    keyInput.dispatchEvent(new Event("input"));
    attackPanel.reset();
    syncCipherControls();
  });

  keyInput.addEventListener("input", syncCipherControls);

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
    const startOptions = {
      rounds: currentRounds(),
      cipherType: cipherSelect.value,
    };
    if (cipherSelect.value === "lucifer") {
      const mk = parseLuciferKey(keyInput.value);
      if (mk === null) return;
      startOptions.masterKey = mk;
    }
    attackPanel.startSolve(ciphertext, startOptions);
  });
});
