#!/usr/bin/env node
// Pool drill answer-keys and report A/B/C/D distribution + skew verdict.
//
// Input: a text file, one drill per line, letters only (A/B/C/D), e.g.
//   ACDBBACDDB
//   BADCACBDDA
// Whitespace, commas, and case are ignored; any non-ABCD char is skipped
// (with a warning) so you can paste loosely.
//
// Usage:  node tally.js answers.txt

const fs = require("fs");

const file = process.argv[2];
if (!file) {
  process.stderr.write("usage: node tally.js <answers.txt>\n");
  process.exit(1);
}

const raw = fs.readFileSync(file, "utf8");

// Flatten to a single ordered letter stream (for run detection), tracking skips.
const letters = [];
let skipped = 0;
for (const ch of raw.toUpperCase()) {
  if (ch === "A" || ch === "B" || ch === "C" || ch === "D") letters.push(ch);
  else if (/[A-Z0-9]/.test(ch)) skipped++; // stray alnum, not whitespace/punct
}

const n = letters.length;
if (n === 0) {
  process.stderr.write("no A/B/C/D letters found in input\n");
  process.exit(1);
}

const counts = { A: 0, B: 0, C: 0, D: 0 };
letters.forEach((l) => (counts[l] += 1));

// Longest run of the same letter across the whole pooled stream.
let longestRun = 1;
let runLetter = letters[0];
let run = 1;
for (let i = 1; i < letters.length; i++) {
  run = letters[i] === letters[i - 1] ? run + 1 : 1;
  if (run > longestRun) {
    longestRun = run;
    runLetter = letters[i];
  }
}

const pct = (c) => (100 * c) / n;
const pcts = Object.fromEntries(["A", "B", "C", "D"].map((l) => [l, pct(counts[l])]));
const minLetter = ["A", "B", "C", "D"].reduce((m, l) => (pcts[l] < pcts[m] ? l : m), "A");
const maxLetter = ["A", "B", "C", "D"].reduce((m, l) => (pcts[l] > pcts[m] ? l : m), "A");

// Thresholds (see PROTOCOL.md).
const STARVED = 18; // any letter below this % = starved (esp. D)
const CROWDED = 32; // any letter above this % = crowding

const problems = [];
for (const l of ["A", "B", "C", "D"]) {
  if (pcts[l] < STARVED) problems.push(`${l} starved (${pcts[l].toFixed(1)}% < ${STARVED}%)`);
  if (pcts[l] > CROWDED) problems.push(`${l} crowding (${pcts[l].toFixed(1)}% > ${CROWDED}%)`);
}

const bar = (p) => "#".repeat(Math.round(p / 2)); // 1 char per 2%

console.log(`\nPooled answers: ${n}` + (skipped ? `  (skipped ${skipped} stray chars)` : ""));
if (n < 120) console.log(`⚠  sample < 120 — result is noisy, gather more drills before trusting it.`);
console.log("");
for (const l of ["A", "B", "C", "D"]) {
  console.log(
    `  ${l}: ${String(counts[l]).padStart(3)}  ${pcts[l].toFixed(1).padStart(5)}%  ${bar(pcts[l])}`
  );
}
console.log("");
console.log(`  spread: ${minLetter}=${pcts[minLetter].toFixed(1)}%  →  ${maxLetter}=${pcts[maxLetter].toFixed(1)}%  (even = 25% each)`);
console.log(`  longest run: ${longestRun}× ${runLetter}`);
console.log("");

if (problems.length === 0 && longestRun < 4) {
  console.log("VERDICT: PASS — even enough (incl. D). Skill alone is sufficient FOR THIS MODEL.");
  console.log("         (A different model may skew differently — this is a snapshot, not a guarantee.)");
} else {
  console.log("VERDICT: FAIL — the skill nudges but does not guarantee here.");
  problems.forEach((p) => console.log(`         - ${p}`));
  if (longestRun >= 4) console.log(`         - long run: ${longestRun}× ${runLetter} in a row`);
  console.log("         Keep the Stop hook (Claude) or use a provider-agnostic wrapper (cross-LLM).");
}
console.log("");
