/*
Error Detection Logic
Combination Testing Process:

Generate all possible k-combinations from available shares
Reconstruct secret for each combination using Lagrange interpolation
Group results by reconstructed secret value (rounded to 10 decimal places)
Find the most frequent result (consensus)
Mark shares not participating in consensus combinations as potentially wrong

Validation Criteria:

Matrix Determinant ≠ 0: Ensures shares are linearly independent
Consensus Threshold: Majority of combinations produce same result
Hash Verification: SHA-256 integrity check for each share
Precision Tolerance: Allow small floating-point errors (< 1e-10)

Usage Process
1. Generate Shares:
Input: secret = "123.456789012345"
       n = 4, k = 3
Process: Generate polynomial, evaluate at x=1,2,3,4
Output: 4 shares with x,y coordinates and hashes
2. Verify and Reconstruct:
Input: JSON array of shares
Process: Apply Lagrange interpolation
Output: Reconstructed secret with error analysis
3. Detect Wrong Shares:
Input: Potentially corrupted shares
Process: Test all k-combinations, find consensus
Output: Identification of valid/invalid shares
Mathematical Foundation
Polynomial Mathematics:

Degree: k-1 (one less than threshold)
Uniqueness: Any k points uniquely determine a polynomial of degree k-1
Security: Fewer than k shares reveal no information about the secret

Linear Algebra:

Vandermonde Matrix: Ensures share uniqueness
Determinant Test: Non-zero determinant confirms linear independence
Matrix Inversion: Required for coefficient recovery

Precision Handling:

Floating Point: 15-decimal precision to handle 20-digit secrets
Error Tolerance: 1e-10 threshold for equality comparisons
Rounding Strategy: Consistent rounding to avoid accumulation errors

#!/usr/bin/env node
"use strict";

/*
  sss_reconstruct.js

  Usage:
    node sss_reconstruct.js < input.json

  - Reads JSON from stdin.
  - No external libraries.
  - Exact rationals with BigInt.
  
*/

const fs = require("fs");
const crypto = require("crypto");

// ---------------- BigInt gcd & Fraction ----------------
function bigAbs(a) { return a >= 0n ? a : -a; }
function bigGcd(a, b) {
  a = bigAbs(a); b = bigAbs(b);
  while (b !== 0n) { const t = a % b; a = b; b = t; }
  return a;
}

class Fraction {
  constructor(n, d = 1n) {
    if (d === 0n) throw new Error("Fraction denominator 0");
    if (d < 0n) { n = -n; d = -d; }
    const g = bigGcd(n, d);
    this.n = n / g;
    this.d = d / g;
  }
  static fromBigInt(x) { return new Fraction(x, 1n); }
  add(o) { return new Fraction(this.n * o.d + o.n * this.d, this.d * o.d); }
  sub(o) { return new Fraction(this.n * o.d - o.n * this.d, this.d * o.d); }
  mul(o) { return new Fraction(this.n * o.n, this.d * o.d); }
  div(o) { if (o.n === 0n) throw new Error("Division by zero fraction"); return new Fraction(this.n * o.d, this.d * o.n); }
  eq(o) { return this.n === o.n && this.d === o.d; }
  isInteger() { return this.d === 1n; }
  toString() { return this.d === 1n ? this.n.toString() : `${this.n.toString()}/${this.d.toString()}`; }
}

// ---------------- base parser ----------------
function charToVal(ch) {
  const c = ch.toLowerCase();
  if (c >= '0' && c <= '9') return BigInt(c.charCodeAt(0) - 48);
  if (c >= 'a' && c <= 'z') return BigInt(c.charCodeAt(0) - 97 + 10);
  throw new Error(`Unsupported digit '${ch}'`);
}

function parseInBase(str, base) {
  const B = BigInt(base);
  if (B < 2n || B > 36n) throw new Error(`Unsupported base ${base}`);
  let v = 0n;
  for (const rawCh of str.trim()) {
    if (rawCh === '_' || rawCh === ' ') continue;
    const d = charToVal(rawCh);
    if (d >= B) throw new Error(`Digit '${rawCh}' invalid for base ${base}`);
    v = v * B + d;
  }
  return v;
}

// ---------------- Lagrange interpolation ----------------
// Compute f(0) from points via exact Lagrange
function lagrangeAtZero(points) {
  // points: [{x: BigInt, y: BigInt}, ...]  (length = k)
  let acc = new Fraction(0n, 1n);
  const k = points.length;
  for (let i = 0; i < k; ++i) {
    const xi = points[i].x;
    const yi = points[i].y;
    let num = new Fraction(1n, 1n);
    let den = new Fraction(1n, 1n);
    for (let j = 0; j < k; ++j) {
      if (i === j) continue;
      const xj = points[j].x;
      // L_i(0) factor: (-xj) / (xi - xj)
      num = num.mul(new Fraction(-xj, 1n));
      den = den.mul(new Fraction(xi - xj, 1n));
    }
    const Li0 = num.div(den);
    acc = acc.add(Fraction.fromBigInt(yi).mul(Li0));
  }
  return acc;
}

function lagrangeEval(points, xq) {
  let acc = new Fraction(0n, 1n);
  const k = points.length;
  for (let i = 0; i < k; ++i) {
    const xi = points[i].x;
    const yi = points[i].y;
    let num = new Fraction(1n, 1n);
    let den = new Fraction(1n, 1n);
    for (let j = 0; j < k; ++j) {
      if (i === j) continue;
      const xj = points[j].x;
      num = num.mul(new Fraction(xq - xj, 1n));
      den = den.mul(new Fraction(xi - xj, 1n));
    }
    const Li = num.div(den);
    acc = acc.add(Fraction.fromBigInt(yi).mul(Li));
  }
  return acc;
}

// ---------------- combinations generator ----------------
function* combinations(arr, k) {
  const n = arr.length;
  if (k > n) return;
  const idx = Array.from({length: k}, (_, i) => i);
  while (true) {
    yield idx.map(i => arr[i]);
    let p = k - 1;
    while (p >= 0 && idx[p] === p + n - k) p--;
    if (p < 0) break;
    idx[p]++;
    for (let j = p + 1; j < k; ++j) idx[j] = idx[j-1] + 1;
  }
}

// ---------------- Utils ----------------
function sha256Hex(str) {
  return crypto.createHash("sha256").update(str, "utf8").digest("hex");
}

// ---------------- Input parse & main ----------------
function readStdinAll() {
  return fs.readFileSync(0, "utf8");
}

function parseInput(jsonText) {
  const data = JSON.parse(jsonText);
  if (!data.keys || typeof data.keys.n !== "number" || typeof data.keys.k !== "number") {
    throw new Error("Invalid JSON: missing keys.n or keys.k");
  }
  const shares = [];
  for (const k of Object.keys(data)) {
    if (k === "keys") continue;
    if (!/^\d+$/.test(k)) continue; // ignore non-numeric top-level keys
    const entry = data[k];
    if (!entry || typeof entry.base !== "string" || typeof entry.value !== "string") {
      throw new Error(`Invalid entry for key ${k}`);
    }
    const x = BigInt(k);
    const base = parseInt(entry.base, 10);
    const y = parseInBase(entry.value, base);
    shares.push({ x, y, base, raw: entry.value, label: k });
  }
  shares.sort((a,b) => (a.x < b.x ? -1 : a.x > b.x ? 1 : 0));
  return { n: data.keys.n, k: data.keys.k, shares };
}

function main() {
  const jsonText = readStdinAll();
  const { n, k, shares } = parseInput(jsonText);

  if (k < 2) { console.error("k must be >= 2"); process.exit(1); }
  if (k > shares.length) { console.error("k cannot exceed number of parsed shares"); process.exit(1); }

  let best = { fitCount: -1, subset: null, secretFrac: null, fits: null };

  // Try all subsets of size k
  for (const subset of combinations(shares, k)) {
    // skip degenerate subset (duplicate x)
    const xs = subset.map(s => s.x.toString());
    const xsSet = new Set(xs);
    if (xsSet.size !== xs.length) continue;

    let secretFrac;
    try {
      secretFrac = lagrangeAtZero(subset);
    } catch (e) {
      continue; // numerical degeneracy
    }

    // verify across all shares
    let fits = new Array(shares.length).fill(false);
    let fitCount = 0;
    for (let i = 0; i < shares.length; ++i) {
      const p = shares[i];
      const val = lagrangeEval(subset, p.x);
      // Must match exactly (y is integer)
      if (val.isInteger() && val.n === p.y) { fits[i] = true; fitCount++; }
    }

    if (fitCount > best.fitCount) {
      best = { fitCount, subset, secretFrac, fits };
      // Early exit if perfect fit
      if (fitCount === shares.length) break;
    }
  }

  if (!best.subset) {
    console.error("Failed to reconstruct with given shares.");
    process.exit(1);
  }

  // Output
  console.log("=== Reconstruction Result ===");
  console.log(`Parsed shares: ${shares.length}  (keys.n = ${n})`);
  console.log(`Threshold k = ${k}  -> polynomial degree = ${k-1}`);
  console.log(`Best-fit shares count: ${best.fitCount}/${shares.length}\n`);

  const good = [];
  const bad = [];
  for (let i = 0; i < shares.length; ++i) {
    if (best.fits[i]) good.push(shares[i]); else bad.push(shares[i]);
  }

  console.log("Good shares (fit polynomial):");
  for (const p of good) {
    console.log(`  x=${p.x.toString()}  y(base ${p.base})='${p.raw}'  y(10)=${p.y.toString()}`);
  }
  console.log("");

  if (bad.length > 0) {
    console.log("Bad/Incorrect shares (do NOT fit):");
    for (const p of bad) {
      console.log(`  x=${p.x.toString()}  y(base ${p.base})='${p.raw}'  y(10)=${p.y.toString()}`);
    }
    console.log("");
  } else {
    console.log("No bad shares detected.\n");
  }

  const secretFrac = best.secretFrac;
  console.log("Secret f(0):");
  console.log("  exact =", secretFrac.toString());
  if (secretFrac.isInteger()) {
    const sStr = secretFrac.n.toString();
    console.log("  decimal =", sStr);
    console.log("  sha256(secret) =", sha256Hex(sStr));
  }
  console.log("\nSubset used (x values):", best.subset.map(p => p.x.toString()).join(", "));
}

// Run
try {
  main();
} catch (e) {
  console.error("Error:", e.message);
  process.exit(1);
}
