# UI / Design Ideas

The strongest opportunity is to lean harder into the "crypto terminal / lab instrument" identity the site already has. The current design is clean and coherent; the next step is making each area feel more distinct and a little more dramatic.

## Ideas

- Give each cipher its own accent mode. Keep the same base UI, but swap the accent color and small decorative details for Caesar, Substitution, Vigenere, and Product so each tab feels like a different machine instead of the same screen reused.
- Add a thin live "signal strip" above the solver panels showing things like text length, repeated patterns found, estimated keyspace feel, and solver status. That would make the page feel more like an analysis console.
- Make `Encrypt` feel theatrical. Instead of just updating the grid, briefly animate plaintext flowing through a pipeline: substitute, shift, transpose, then land in the ciphertext panel.
- Add a faint baseline overlay to the histogram. Showing an "expected English shape" behind the live bars would make the teaching value much clearer at a glance.
- Turn the attack panel into more of a performance. Add phase colors, subtle pulses on accepted swaps, and a more prominent "temperature / score improving" feel so solving feels alive.
- Add an "x-ray mode" toggle. It could highlight repeated digrams, doubled letters, column structure, or key-period grouping directly in the ciphertext grid.
- Push panel framing further aesthetically with corner brackets, scanline texture, a subtle grid/noise background, and stronger depth layering behind cards.
- Make the overview/topic pages feel more editorial. A left-side progress rail, sticky mini table of contents, or section markers like "01 / 02 / 03" would make the reading experience feel more designed.
- Add short status microcopy throughout the app, like "pattern leak detected," "best key length candidate: 5," or "mapping stabilizing," to add personality without changing layout much.
- Introduce a stronger landing moment. A short intro panel or "choose a demo" launcher on first load could make the site feel less like a static class page and more like an interactive exhibit.

## Best Bang For Buck

1. Cipher-specific accent themes.
2. A live analysis/status strip above the solver.
3. A more cinematic encrypt/solve animation pass.
