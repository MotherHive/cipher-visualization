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

## Attribution

English frequency and gram-data credit:

- Practical Cryptography, "English Letter Frequencies":
  http://practicalcryptography.com/cryptanalysis/letter-frequencies-various-languages/english-letter-frequencies/

This project uses that Practical Cryptography material as the credited source reference for the bundled English frequency / gram data.

## License

This project is released under the MIT License. See `LICENSE`.
