import { productEncrypt } from "./js/product.js";
import { createProductSolverIterator } from "./js/product-solver.js";
import { loadScoringData } from "./js/solver.js";
import { englishCoverage } from "./js/vigenere-solver.js";
import { randomKey } from "./js/keys.js";
import fs from "node:fs";
import path from "node:path";

// Stub fetch for the scoring data loader (it fetches generated-ngram-data.js).
const root = path.resolve("./");
globalThis.fetch = async (url) => {
  // The solver loads generated-ngram-data.js via dynamic import elsewhere; loadScoringData uses fetch on data path?
  throw new Error("unexpected fetch: " + url);
};

await loadScoringData();

const plaintexts = [
  "Mary had a little lamb whose fleece was white as snow. Everywhere that Mary went the lamb was sure to go. It followed her to school one day which was against the rule. It made the children laugh and play to see a lamb at school.",
  "The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs. How vexingly quick daft zebras jump! The five boxing wizards jump quickly. Sphinx of black quartz, judge my vow.",
  "It was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness, it was the epoch of belief, it was the epoch of incredulity, it was the season of light.",
];

for (let trial = 0; trial < plaintexts.length; trial++) {
  const plaintext = plaintexts[trial];
  const key = randomKey("product");
  const sep = key.indexOf("|");
  const transKey = key.slice(0, sep);
  const subKey = key.slice(sep + 1);
  const ciphertext = productEncrypt(plaintext, transKey, subKey);
  const it = createProductSolverIterator(ciphertext, { rounds: 4 });
  let last = null;
  for (const step of it) last = step;
  const cov = englishCoverage(last.decoded);
  console.log(`Trial ${trial}: phase=${last.phase} width=${last.transWidth} order=${JSON.stringify(last.transOrder)} cov=${cov.toFixed(3)} score=${(last.score ?? 0).toFixed(2)}`);
  console.log(`  trueTransKey=${JSON.stringify(transKey)} (len ${transKey.length})`);
  console.log(`  truePlain[:80] = ${JSON.stringify(plaintext.slice(0, 80))}`);
  console.log(`  decoded[:80]   = ${JSON.stringify((last.decoded ?? "").slice(0, 80))}`);
}
