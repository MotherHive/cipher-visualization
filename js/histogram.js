let activeAnimation = null;

/**
 * Renders a horizontal bar chart that animates as if scanning
 * through the text and collecting character counts one by one.
 */
export function renderHistogram(text, container) {
  // Cancel any in-progress animation
  if (activeAnimation) {
    cancelAnimationFrame(activeAnimation);
    activeAnimation = null;
  }

  container.innerHTML = "";

  // Pre-compute final counts to know the sort order and max
  const finalCounts = {};
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (code >= 32 && code <= 126) {
      finalCounts[char] = (finalCounts[char] || 0) + 1;
    }
  }

  const sorted = Object.keys(finalCounts).sort(
    (a, b) => finalCounts[b] - finalCounts[a]
  );

  if (sorted.length === 0) return;

  const finalMax = finalCounts[sorted[0]];

  // Build all rows up front with zero-width bars
  const bars = {};
  const countLabels = {};

  for (const char of sorted) {
    const row = document.createElement("div");
    row.className = "hist-row";

    const label = document.createElement("span");
    label.className = "hist-label";
    label.textContent = char;

    const barWrap = document.createElement("div");
    barWrap.className = "hist-bar-wrap";

    const bar = document.createElement("div");
    bar.className = "hist-bar";
    bar.style.width = "0%";
    bar.style.transition = "width 150ms ease-out";

    const countLabel = document.createElement("span");
    countLabel.className = "hist-count";
    countLabel.textContent = "0";

    barWrap.appendChild(bar);
    row.appendChild(label);
    row.appendChild(barWrap);
    row.appendChild(countLabel);
    container.appendChild(row);

    bars[char] = bar;
    countLabels[char] = countLabel;
  }

  // Filter to printable chars for scanning
  const printable = [];
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (code >= 32 && code <= 126) printable.push(char);
  }

  // Animate: scan through chars in batches per frame
  const totalChars = printable.length;
  const duration = 500; // total animation time in ms
  const liveCounts = {};
  let scanned = 0;

  const t0 = performance.now();

  function tick(now) {
    const elapsed = now - t0;
    const target = Math.min(
      totalChars,
      Math.floor((elapsed / duration) * totalChars)
    );

    // Process chars up to target
    while (scanned < target) {
      const char = printable[scanned];
      liveCounts[char] = (liveCounts[char] || 0) + 1;
      scanned++;
    }

    // Find current max for scaling
    let currentMax = 1;
    for (const char of sorted) {
      if ((liveCounts[char] || 0) > currentMax) {
        currentMax = liveCounts[char];
      }
    }

    // Update bar widths and counts
    for (const char of sorted) {
      const count = liveCounts[char] || 0;
      bars[char].style.width = (count / finalMax) * 100 + "%";
      countLabels[char].textContent = count;
    }

    if (scanned < totalChars) {
      activeAnimation = requestAnimationFrame(tick);
    } else {
      activeAnimation = null;
    }
  }

  activeAnimation = requestAnimationFrame(tick);
}
