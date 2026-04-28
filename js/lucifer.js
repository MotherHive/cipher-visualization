// Mini-Lucifer: a 16-bit, 4-round Feistel block cipher for teaching.
//
//   block:  16 bits  -> two 8-bit halves L, R
//   key:    16 bits  -> four 8-bit round keys via a 4-bit rotating window
//   round:  L_{i+1} = R_i,  R_{i+1} = L_i XOR F(R_i, K_{i+1})
//   F(x,k): nibbleSwap( S(hi(x XOR k)) || S(lo(x XOR k)) )
//   end:    final swap, so decrypt = same network with reversed round keys
//
// The S-box is Heys' 4-bit S-box from "A Tutorial on Linear and Differential
// Cryptanalysis" -- chosen because it has well-studied differentials, which
// the Phase 4 solver will exploit.

export const LUCIFER_SBOX = Object.freeze([
  0xe, 0x4, 0xd, 0x1, 0x2, 0xf, 0xb, 0x8,
  0x3, 0xa, 0x6, 0xc, 0x5, 0x9, 0x0, 0x7,
]);

export const LUCIFER_SBOX_INV = (() => {
  const inv = new Array(16);
  for (let i = 0; i < 16; i++) inv[LUCIFER_SBOX[i]] = i;
  return Object.freeze(inv);
})();

export const LUCIFER_ROUNDS = 4;

export function luciferRoundKeys(masterKey16) {
  const k = masterKey16 & 0xffff;
  // Treat the 16-bit key as a circular bit string; each round key is an
  // 8-bit window starting 4 bits later than the previous one.
  const rot = (shift) => ((k << shift) | (k >>> (16 - shift))) & 0xffff;
  return [
    (rot(0) >>> 8) & 0xff,
    (rot(4) >>> 8) & 0xff,
    (rot(8) >>> 8) & 0xff,
    (rot(12) >>> 8) & 0xff,
  ];
}

function roundFunction(rByte, roundKey) {
  const x = (rByte ^ roundKey) & 0xff;
  const hi = LUCIFER_SBOX[(x >>> 4) & 0xf];
  const lo = LUCIFER_SBOX[x & 0xf];
  // P-box: swap nibbles.
  return ((lo << 4) | hi) & 0xff;
}

function feistelNetwork(block16, roundKeys) {
  let l = (block16 >>> 8) & 0xff;
  let r = block16 & 0xff;
  for (let i = 0; i < LUCIFER_ROUNDS; i++) {
    const next = (l ^ roundFunction(r, roundKeys[i])) & 0xff;
    l = r;
    r = next;
  }
  // Final swap.
  return ((r << 8) | l) & 0xffff;
}

export function luciferEncryptBlock(block16, masterKey16) {
  return feistelNetwork(block16 & 0xffff, luciferRoundKeys(masterKey16));
}

export function luciferDecryptBlock(block16, masterKey16) {
  const rk = luciferRoundKeys(masterKey16);
  return feistelNetwork(block16 & 0xffff, [rk[3], rk[2], rk[1], rk[0]]);
}

export function parseLuciferKey(keyStr) {
  const s = (keyStr ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{1,4}$/.test(s)) return null;
  return parseInt(s.padStart(4, "0"), 16) & 0xffff;
}

export function formatLuciferKey(u16) {
  return ((u16 ?? 0) & 0xffff).toString(16).padStart(4, "0");
}

const PAD_BYTE = 0x00;

function bytesToBlocks(bytes) {
  const blocks = [];
  for (let i = 0; i < bytes.length; i += 2) {
    const hi = bytes[i];
    const lo = i + 1 < bytes.length ? bytes[i + 1] : PAD_BYTE;
    blocks.push(((hi << 8) | lo) & 0xffff);
  }
  return blocks;
}

function blocksToHex(blocks) {
  return blocks.map((b) => b.toString(16).padStart(4, "0")).join("");
}

function hexToBlocks(hex) {
  const s = (hex ?? "").trim().toLowerCase().replace(/\s+/g, "");
  if (!/^[0-9a-f]*$/.test(s) || s.length % 4 !== 0) return null;
  const blocks = [];
  for (let i = 0; i < s.length; i += 4) {
    blocks.push(parseInt(s.slice(i, i + 4), 16) & 0xffff);
  }
  return blocks;
}

export function luciferEncrypt(text, keyStr) {
  const key = parseLuciferKey(keyStr);
  if (key === null) return "";
  const input = text ?? "";
  const bytes = [];
  for (let i = 0; i < input.length; i++) bytes.push(input.charCodeAt(i) & 0xff);
  const out = bytesToBlocks(bytes).map((b) => luciferEncryptBlock(b, key));
  return blocksToHex(out);
}

export function luciferDecrypt(hexStr, keyStr) {
  const key = parseLuciferKey(keyStr);
  if (key === null) return "";
  const blocks = hexToBlocks(hexStr);
  if (blocks === null) return "";
  const bytes = [];
  for (const c of blocks) {
    const p = luciferDecryptBlock(c, key);
    bytes.push((p >>> 8) & 0xff, p & 0xff);
  }
  // Strip a single trailing pad byte added during encryption of odd-length input.
  // Plaintext is expected to be printable ASCII (>= 0x20), so a trailing 0x00
  // is unambiguously padding.
  if (bytes.length && bytes[bytes.length - 1] === PAD_BYTE) bytes.pop();
  return String.fromCharCode(...bytes);
}

// dev sanity -- callable from the browser console as luciferSelfTest().
export function luciferSelfTest() {
  const cases = [
    { text: "HI", key: "a3f7" },
    { text: "HELLO WORLD", key: "0000" },
    { text: "A", key: "ffff" },
    { text: "Mini-Lucifer demo!", key: "1234" },
  ];
  for (const { text, key } of cases) {
    const ct = luciferEncrypt(text, key);
    const pt = luciferDecrypt(ct, key);
    if (pt !== text) {
      console.error("luciferSelfTest FAIL", { text, key, ct, pt });
      return false;
    }
  }
  // Round-key schedule on a known key.
  const rk = luciferRoundKeys(0xa3f7);
  if (rk.length !== 4 || rk.some((b) => b < 0 || b > 0xff)) {
    console.error("luciferSelfTest FAIL: bad round keys", rk);
    return false;
  }
  // S-box/inverse consistency.
  for (let i = 0; i < 16; i++) {
    if (LUCIFER_SBOX_INV[LUCIFER_SBOX[i]] !== i) {
      console.error("luciferSelfTest FAIL: sbox inverse broken at", i);
      return false;
    }
  }
  console.log("luciferSelfTest OK");
  return true;
}
