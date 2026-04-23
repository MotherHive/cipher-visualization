import { renderHistogram } from "./histogram.js";

const MAX_TEXT_LENGTH = 256;

export function initCaesar(tab) {
    const inputText = tab.querySelector(".input-text");
    const cipherSelect = tab.querySelector(".cipher-select");
    const gridContainer = tab.querySelector(".text-grid");
    const encryptBtn = tab.querySelector(".encrypt-btn");
    const keyInput = tab.querySelector(".key-input");
    const freqChart = tab.querySelector(".frequency-chart");

    let lastEncrypted = null;
    let currentDisplayedText = inputText.value.slice(0, MAX_TEXT_LENGTH);
    let showingCiphertext = false;
    let revealFrameId = null;
    let revealRunId = 0;

    function ensureGrid(text) {
        const currentCells = gridContainer.querySelectorAll(".cell");
        if (currentCells.length !== text.length) {
            renderGrid(text, gridContainer);
        }
    }

    function setGridText(text) {
        const spans = gridContainer.querySelectorAll(".cell");
        for (let i = 0; i < spans.length; i++) {
            spans[i].textContent = text[i] ?? "";
        }
    }

    function stopReveal() {
        revealRunId++;
        if (revealFrameId !== null) {
            cancelAnimationFrame(revealFrameId);
            revealFrameId = null;
        }
    }

    function currentShift() {
        const parsed = Number.parseInt(keyInput.value, 10);
        return Number.isNaN(parsed) ? 0 : parsed;
    }

    function currentCipherType() {
        return cipherSelect?.value ?? "caesar";
    }

    function clampText(text) {
        return (text ?? "").slice(0, MAX_TEXT_LENGTH);
    }

    function syncInputText() {
        const clamped = clampText(inputText.value);
        if (inputText.value !== clamped) {
            inputText.value = clamped;
        }
        return clamped;
    }

    function normalizeSubstitutionKey(key) {
        const normalized = (key ?? "").slice(0, PRINTABLE_RANGE);
        if (normalized.length !== PRINTABLE_RANGE) return null;

        const uniqueChars = new Set(normalized);
        if (uniqueChars.size !== PRINTABLE_RANGE) return null;

        for (const ch of normalized) {
            const code = ch.charCodeAt(0);
            if (code < PRINTABLE_START || code > PRINTABLE_END) return null;
        }

        return normalized;
    }

    function substitutionEncrypt(text, key) {
        const normalizedKey = normalizeSubstitutionKey(key);
        const sourceText = clampText(text);
        if (!normalizedKey) return sourceText;

        return sourceText.split("").map((char) => {
            const code = char.charCodeAt(0);
            if (code >= PRINTABLE_START && code <= PRINTABLE_END) {
                return normalizedKey[code - PRINTABLE_START];
            }

            return char;
        }).join("");
    }

    function vigenereEncrypt(text, key) {
        const normalizedKey = (key ?? "").toUpperCase().replace(/[^A-Z]/g, "");
        const sourceText = clampText(text);
        if (!normalizedKey) return sourceText;

        let keyIndex = 0;

        return sourceText.split("").map((char) => {
            const code = char.charCodeAt(0);

            if (code < 65 || code > 90) {
                return char;
            }

            const shift = normalizedKey.charCodeAt(keyIndex % normalizedKey.length) - 65;
            keyIndex++;
            return String.fromCharCode(((code - 65 + shift) % 26) + 65);
        }).join("");
    }

    function getCiphertext() {
        const sourceText = syncInputText();
        switch (currentCipherType()) {
            case "substitution":
                return substitutionEncrypt(sourceText, keyInput.value);
            case "vigenere":
                return vigenereEncrypt(sourceText, keyInput.value);
            case "caesar":
            default:
                return caesarShift(sourceText, currentShift());
        }
    }

    function updateGrid(text, { animate = true } = {}) {
        const nextText = clampText(text);
        stopReveal();
        ensureGrid(nextText);
        renderHistogram(nextText, freqChart);
        currentDisplayedText = nextText;

        if (!animate) {
            setGridText(nextText);
            return;
        }

        const runId = revealRunId;
        scrambleReveal(nextText, gridContainer, {
            isActive: () => runId === revealRunId,
            setFrameId: (frameId) => {
                revealFrameId = frameId;
            },
        });
    }

    function showPlaintext(options = {}) {
        const plaintext = syncInputText();
        lastEncrypted = null;
        showingCiphertext = false;
        updateGrid(plaintext, options);
    }

    function showCiphertext(options = {}) {
        const ciphertext = getCiphertext();
        const encryptionKey = currentCipherType() + "|" + syncInputText() + "|" + keyInput.value;

        if (
            !options.force &&
            showingCiphertext &&
            encryptionKey === lastEncrypted &&
            currentDisplayedText === ciphertext
        ) {
            return ciphertext;
        }

        lastEncrypted = encryptionKey;
        showingCiphertext = true;
        updateGrid(ciphertext, options);
        return ciphertext;
    }

    inputText.maxLength = MAX_TEXT_LENGTH;
    inputText.addEventListener("input", () => showPlaintext());
    cipherSelect?.addEventListener("input", () => showPlaintext());

    encryptBtn.addEventListener("click", () => {
        showCiphertext();
    });

    showPlaintext();

    tab._getCurrentText = () => currentDisplayedText;
    tab._getCiphertext = getCiphertext;
    tab._showCiphertext = showCiphertext;
    tab._stopGridAnimation = () => {
        stopReveal();
        setGridText(currentDisplayedText);
    };
    tab._getGridContainer = () => gridContainer;
}

export const PRINTABLE_START = 32;  // space
export const PRINTABLE_END = 126;   // tilde ~
export const PRINTABLE_RANGE = PRINTABLE_END - PRINTABLE_START + 1; // 95

export function caesarShift(text, shift) {
    shift = ((shift % PRINTABLE_RANGE) + PRINTABLE_RANGE) % PRINTABLE_RANGE;

    return (text ?? "").slice(0, MAX_TEXT_LENGTH).split("").map(char => {
        const code = char.charCodeAt(0);

        if (code >= PRINTABLE_START && code <= PRINTABLE_END) {
            return String.fromCharCode(
                ((code - PRINTABLE_START + shift) % PRINTABLE_RANGE) + PRINTABLE_START
            );
        }

        return char;
    }).join("");
}

export function renderGrid(text, container) {
    container.innerHTML = "";

    text.split("").forEach(char => {
        const span = document.createElement("span");
        span.textContent = char;
        span.className = "cell";
        container.appendChild(span);
    });
}

function randomPrintableChar() {
    return String.fromCharCode(PRINTABLE_START + Math.floor(Math.random() * PRINTABLE_RANGE));
}

/**
 * Scramble-reveal animation that spreads from multiple random seed points.
 * Each cell flips through a few random characters before landing on its final value.
 */
function scrambleReveal(finalText, container, controls = {}) {
    const isActive = controls.isActive ?? (() => true);
    const setFrameId = controls.setFrameId ?? (() => {});
    const cols = 16;
    const spans = container.querySelectorAll(".cell");

    // Pick 3–5 random seed points on the grid
    const seedCount = 3 + Math.floor(Math.random() * 3);
    const seeds = [];
    for (let s = 0; s < seedCount; s++) {
        seeds.push({
            r: Math.floor(Math.random() * Math.ceil(finalText.length / cols)),
            c: Math.floor(Math.random() * cols),
        });
    }

    // For each cell, distance = minimum distance to any seed
    const cells = [];
    let maxDist = 0;

    for (let i = 0; i < finalText.length; i++) {
        const r = Math.floor(i / cols);
        const c = i % cols;

        let dist = Infinity;
        for (const seed of seeds) {
            const d = Math.sqrt((r - seed.r) ** 2 + (c - seed.c) ** 2);
            if (d < dist) dist = d;
        }
        if (dist > maxDist) maxDist = dist;

        // Each cell gets 3–6 flips before settling
        const flips = 10 + Math.floor(Math.random() * 4);

        cells.push({
            span: spans[i],
            finalChar: finalText[i],
            dist,
            flips,
            flipped: 0,
            settled: false,
        });
    }

    const flipInterval = 30;     // ms between each flip for a cell
    const staggerRange = 500;    // ms spread between nearest and farthest cells

    // Start time for each cell based on distance from nearest seed
    const startTimes = cells.map(c =>
        maxDist > 0 ? (c.dist / maxDist) * staggerRange : 0
    );

    const t0 = performance.now();
    let lastFlipTime = t0;

    function tick(now) {
        if (!isActive()) return;

        const elapsed = now - t0;
        const shouldFlip = now - lastFlipTime >= flipInterval;
        if (shouldFlip) lastFlipTime = now;

        let allDone = true;

        for (let i = 0; i < cells.length; i++) {
            if (cells[i].settled) continue;

            const cellElapsed = elapsed - startTimes[i];

            if (cellElapsed < 0) {
                // Hasn't started — keep current character
                allDone = false;
            } else if (cells[i].flipped < cells[i].flips) {
                // Still flipping
                allDone = false;
                if (shouldFlip) {
                    cells[i].span.textContent = randomPrintableChar();
                    cells[i].flipped++;
                }
            } else {
                // Done — lock in final character
                cells[i].span.textContent = cells[i].finalChar;
                cells[i].settled = true;
            }
        }

        if (!allDone) {
            setFrameId(requestAnimationFrame(tick));
        } else {
            setFrameId(null);
        }
    }

    setFrameId(requestAnimationFrame(tick));
}
    function clampText(text) {
        return (text ?? "").slice(0, MAX_TEXT_LENGTH);
    }

    function syncInputText() {
        const clamped = clampText(inputText.value);
        if (inputText.value !== clamped) {
            inputText.value = clamped;
        }
        return clamped;
    }
