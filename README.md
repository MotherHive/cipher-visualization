# Cipher Visualization

Interactive browser-based cipher demo for exploring encryption, frequency analysis, and heuristic solving.

The app currently includes:

- Caesar cipher over the full printable ASCII range
- Substitution cipher with a full printable-character keyspace
- Vigenere cipher over the full printable ASCII range
- Frequency histogram and mapping-table visualization
- A solver flow for Caesar and substitution ciphers

## Project Layout

- `index.html` - app shell and UI markup
- `css/style.css` - visual styling
- `js/` - cipher logic, solver logic, UI behavior, and generated n-gram tables
- `gram_data/` - English frequency, n-gram, and word-frequency source files
- `scripts/build-ngram-module.mjs` - builds `js/generated-ngram-data.js` from `gram_data/`

## Running Locally

This project is a static frontend app, so the simplest way to use it is to open `index.html` in a browser.

If you update the files in `gram_data/`, rebuild the generated scoring module with:

```bash
node scripts/build-ngram-module.mjs
```

## Data Notes

The solver uses generated English scoring tables from the text files in `gram_data/`. Those files are compiled into `js/generated-ngram-data.js` by `scripts/build-ngram-module.mjs`.

## Credits and Attribution

This project mixes original UI / teaching code with a few borrowed or adapted data sources, cipher components, and demo texts.

### English Scoring Data

- The bundled files in `gram_data/` and the generated module `js/generated-ngram-data.js` are sourced from Practical Cryptography English frequency / n-gram / word-frequency material used for classical cipher analysis:
  http://practicalcryptography.com/cryptanalysis/letter-frequencies-various-languages/english-letter-frequencies/
- The printable-ASCII frequency table in `js/vigenere-solver.js` is based on Robert Lewand, *Cryptological Mathematics* (2000). The punctuation weights in that table are project-level estimates added for this app's full-printable-ASCII solver.

### Mini-Lucifer

- `js/lucifer.js` is a repo-specific teaching implementation, but its 4-bit S-box is intentionally borrowed from Howard M. Heys, *A Tutorial on Linear and Differential Cryptanalysis*:
  https://doi.org/10.1080/0161-110291890885
- The Mini-Lucifer walkthrough in `index.html` is built around that same teaching reference so the four-round demo remains small enough for the differential-cryptanalysis visualization to work.

### Plaintext Examples

- `js/plaintext.js` draws from public-domain or traditional material, including Shakespeare (*Hamlet*, *The Merchant of Venice*, *Richard III*, *Romeo and Juliet*, *Julius Caesar*, *Macbeth*), Herman Melville (*Moby-Dick*), Charles Dickens (*A Tale of Two Cities*), Jane Austen (*Pride and Prejudice*), Genesis, the U.S. Constitution Preamble, the Gettysburg Address, Patrick Henry's "Give me liberty, or give me death!", Benjamin Franklin's "Early to bed and early to rise...", traditional nursery rhymes, and standard pangrams such as "The quick brown fox jumps over the lazy dog."
- Several sample strings are shortened, normalized to uppercase, combined, or lightly adapted so they fit the demo format; they are included as recognizable teaching examples rather than as authoritative editions.

## License

This project is released under the MIT License. See `LICENSE`.
