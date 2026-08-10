#!/usr/bin/env node
// Drill key generator (CCA-F). Builds a balanced, shuffled A/B/C/D answer key
// of length N that satisfies the same distribution rules the Stop hook enforces
// (per-letter cap, no run of 4+), then writes it to the gitignored key file.
//
// CRITICAL: prints NOTHING to stdout on success, so the answer sequence never
// appears in the chat when this runs as a tool call. Usage:
//   node drill-keygen.js <N>

const fs = require("fs");
const path = require("path");

function keyFilePath() {
  if (process.env.DRILL_KEY_FILE) return process.env.DRILL_KEY_FILE;
  const projectDir = process.env.CLAUDE_PROJECT_DIR || ".";
  return path.join(projectDir, ".claude", ".drill-key.json");
}

// --record MODE: write an explicit, already-disclosed key at the END of a drill
// so the Stop hook can audit its distribution. Usage:
//   node drill-keygen.js --record A C D B ...
if (process.argv[2] === "--record") {
  const seq = process.argv.slice(3).map((s) => s.trim().toUpperCase());
  if (!seq.length) {
    process.stderr.write("usage: drill-keygen.js --record <A B C ...>\n");
    process.exit(1);
  }
  fs.writeFileSync(
    keyFilePath(),
    JSON.stringify({ key: seq, revealed: seq.length }) + "\n"
  );
  process.exit(0); // silent
}

const n = parseInt(process.argv[2], 10);
if (!Number.isInteger(n) || n < 1 || n > 200) {
  process.stderr.write("usage: drill-keygen.js <N>  |  drill-keygen.js --record <A B C ...>\n");
  process.exit(1);
}

const LETTERS = ["A", "B", "C", "D"];
const cap = Math.ceil(n / 4) + 1; // must stay <= Stop hook's cap

function buildPool() {
  // Even base counts, remainder spread across distinct letters.
  const base = Math.floor(n / 4);
  const counts = { A: base, B: base, C: base, D: base };
  let rem = n - base * 4;
  const order = shuffle(LETTERS.slice());
  for (let i = 0; i < rem; i++) counts[order[i]] += 1;
  const pool = [];
  for (const l of LETTERS) for (let i = 0; i < counts[l]; i++) pool.push(l);
  return pool;
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function valid(seq) {
  const counts = { A: 0, B: 0, C: 0, D: 0 };
  seq.forEach((l) => (counts[l] += 1));
  if (Object.values(counts).some((c) => c > cap)) return false;
  let run = 1;
  for (let i = 1; i < seq.length; i++) {
    run = seq[i] === seq[i - 1] ? run + 1 : 1;
    if (run >= 4) return false;
  }
  return true;
}

let seq = null;
for (let attempt = 0; attempt < 1000; attempt++) {
  const candidate = shuffle(buildPool());
  if (valid(candidate)) {
    seq = candidate;
    break;
  }
}
if (!seq) {
  process.stderr.write("failed to generate a valid key; retry\n");
  process.exit(1);
}

const file = keyFilePath();
fs.writeFileSync(file, JSON.stringify({ key: seq, revealed: 0 }) + "\n");
// Intentionally no stdout — do not echo the key.
process.exit(0);
