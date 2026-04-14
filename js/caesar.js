export function initCaesar(tab) {
    const inputText = tab.querySelector(".input-text");
    const slider = tab.querySelector(".shift-slider");
    const shiftVal = tab.querySelector(".shift-val")
    const output = tab.querySelector(".output");
    const gridContainer = tab.querySelector(".text-grid");
    

    function update() {
        const text = inputText.value;
        const shift = parseInt(slider.value);

        const shifted = caesarShift(text, shift);


        shiftVal.textContent = shift;
        renderGrid(shifted, gridContainer);
    }

    inputText.addEventListener("input", update);
    slider.addEventListener("input", update);

    slider.addEventListener("mouseenter", () => {
        slider.focus(); // ensures it becomes the active element
    });

    let scrollAccumulator = 0;

    slider.addEventListener("wheel", (e) => {
        e.preventDefault();

        const step = parseInt(slider.step) || 1;
        const min = parseInt(slider.min) || 0;
        const max = parseInt(slider.max) || 100;

        // Accumulate scroll
        scrollAccumulator += e.deltaY;

        const threshold = 100; // increase = less sensitive

        if (Math.abs(scrollAccumulator) >= threshold) {
            let value = parseInt(slider.value);

            if (scrollAccumulator < 0) {
                value += step;
            } else {
                value -= step;
            }

            value = Math.max(min, Math.min(max, value));
            slider.value = value;

            slider.dispatchEvent(new Event("input"));

            // reset after applying
            scrollAccumulator = 0;
        }
    });
    update();
}

export function caesarShift(text, shift) {
    shift = ((shift % 26) + 26) % 26;

    return text.slice(0, 256).split("").map(char => {
        const code = char.charCodeAt(0);

        if (code >= 65 && code <= 90) {
        return String.fromCharCode(((code - 65 + shift) % 26) + 65);
        }

        if (code >= 97 && code <= 122) {
        return String.fromCharCode(((code - 97 + shift) % 26) + 97);
        }

        return char;
    }).join("");
}

function renderGrid(text, container) {
    container.innerHTML = "";

    text.split("").forEach(char => {
        const span = document.createElement("span");
        span.textContent = char;
        span.className = "cell";
        container.appendChild(span);
    });
}