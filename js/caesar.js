import { renderHistogram } from "./histogram.js";

export function initCaesar(tab) {
    const inputText = tab.querySelector(".input-text");
    const gridContainer = tab.querySelector(".text-grid");
    const encryptBtn = tab.querySelector(".encrypt-btn");
    const keyInput = tab.querySelector(".key-input");
    const freqChart = tab.querySelector(".frequency-chart");

    let lastEncrypted = null;
    let currentDisplayedText = inputText.value;

    function updateGrid(text) {
        // Ensure correct number of cells exist
        const currentCells = gridContainer.querySelectorAll(".cell");
        if (currentCells.length !== text.length) {
            renderGrid(text, gridContainer);
        }

        renderHistogram(text, freqChart);
        scrambleReveal(text, gridContainer);
        currentDisplayedText = text;
    }

    function showPlaintext() {
        lastEncrypted = null;
        updateGrid(inputText.value);
    }

    inputText.addEventListener("input", showPlaintext);

    encryptBtn.addEventListener("click", () => {
        const shift = parseInt(keyInput.value) || 0;
        if (shift === 0) return;

        const key = inputText.value + "|" + shift;
        if (key === lastEncrypted) return;
        lastEncrypted = key;

        updateGrid(caesarShift(inputText.value, shift));
    });

    showPlaintext();

    tab._getCurrentText = () => currentDisplayedText;
    tab._getGridContainer = () => gridContainer;
}

export const PRINTABLE_START = 32;  // space
export const PRINTABLE_END = 126;   // tilde ~
export const PRINTABLE_RANGE = PRINTABLE_END - PRINTABLE_START + 1; // 95

export function caesarShift(text, shift) {
    shift = ((shift % PRINTABLE_RANGE) + PRINTABLE_RANGE) % PRINTABLE_RANGE;

    return text.slice(0, 256).split("").map(char => {
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
function scrambleReveal(finalText, container) {
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
            requestAnimationFrame(tick);
        }
    }

    requestAnimationFrame(tick);
}