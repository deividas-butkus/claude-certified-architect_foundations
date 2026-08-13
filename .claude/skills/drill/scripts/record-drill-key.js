#!/usr/bin/env node
// Records a drill answer key for the Stop-hook distribution audit (CCA-F).
// Called by the /drill skill:
//   --clear      at drill start, to remove any stale key file.
//   <A B C ...>  at drill end, to write the key the model used. The Stop hook
//                (drill-distribution-check.js) then reads it and audits the
//                A/B/C/D distribution.
//
// Prints NOTHING to stdout, so the answer sequence never appears in the user's
// chat. Only write the key at drill's end, after every answer is disclosed.

const fs = require("fs");
const path = require("path");

function keyFilePath() {
  if (process.env.DRILL_KEY_FILE) return process.env.DRILL_KEY_FILE;
  const projectDir = process.env.CLAUDE_PROJECT_DIR || ".";
  return path.join(projectDir, ".claude", ".drill-key.json");
}

const file = keyFilePath();

// --clear: remove the key file if present. Silent, idempotent.
if (process.argv[2] === "--clear") {
  try {
    fs.unlinkSync(file);
  } catch {
    // Already absent — nothing to do.
  }
  process.exit(0);
}

const seq = process.argv.slice(2).map((s) => s.trim().toUpperCase());
if (!seq.length) {
  process.stderr.write("usage: record-drill-key.js <A B C ...>  |  record-drill-key.js --clear\n");
  process.exit(1);
}

fs.writeFileSync(file, JSON.stringify({ key: seq }) + "\n");
process.exit(0); // silent — do not echo the key
