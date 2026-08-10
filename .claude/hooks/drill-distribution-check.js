#!/usr/bin/env node
// Stop hook (CCA-F project only): deterministically enforce the drill
// answer-key distribution. Reads the hidden key file that the /drill skill
// writes. If the planned key violates the distribution rules, block the turn
// with a reason fed back to the model so it must fix the key before finishing.
//
// If no key file exists (not a drill turn), do nothing.

const fs = require("fs");
const path = require("path");

function keyFilePath() {
  if (process.env.DRILL_KEY_FILE) return process.env.DRILL_KEY_FILE;
  // Fixed, absolute, same for the native-Node hook and the skill's writer.
  // Avoids the Git-Bash /tmp vs native-Node path mismatch.
  const projectDir = process.env.CLAUDE_PROJECT_DIR || ".";
  return path.join(projectDir, ".claude", ".drill-key.json");
}

function readStdin() {
  return new Promise((resolve) => {
    let raw = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (raw += c));
    process.stdin.on("end", () => resolve(raw));
    // Stop hooks may get no stdin; don't hang.
    setTimeout(() => resolve(raw), 200);
  });
}

function block(reason) {
  process.stdout.write(
    JSON.stringify({ decision: "block", reason })
  );
  process.exit(0);
}

(async () => {
  await readStdin();

  const file = keyFilePath();
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    // No key file / unreadable -> not a drill turn. Allow.
    process.exit(0);
  }

  const key = Array.isArray(data && data.key) ? data.key : null;
  if (!key || key.length === 0) process.exit(0);

  const letters = key.map((x) => String(x).trim().toUpperCase());
  const valid = new Set(["A", "B", "C", "D"]);
  const bad = letters.filter((l) => !valid.has(l));
  if (bad.length) {
    block(
      `Drill key file ${file} contains non-A/B/C/D entries: ${bad.join(", ")}. ` +
        `Fix the key array before ending the turn.`
    );
  }

  const n = letters.length;
  // Per-letter cap: ceil(n/4)+1 tolerates uneven N while catching real clustering.
  const cap = Math.ceil(n / 4) + 1;
  const counts = { A: 0, B: 0, C: 0, D: 0 };
  letters.forEach((l) => (counts[l] += 1));
  const over = Object.entries(counts).filter(([, c]) => c > cap);
  if (over.length) {
    block(
      `Drill key distribution is uneven (n=${n}, cap ${cap} per letter): ` +
        over.map(([l, c]) => `${l}=${c}`).join(", ") +
        `. Full counts A=${counts.A} B=${counts.B} C=${counts.C} D=${counts.D}. ` +
        `Re-plan the key to spread answers across A/B/C/D, rewrite the affected ` +
        `questions, and update ${file}.`
    );
  }

  // Run check: no same letter 4+ times consecutively.
  let run = 1;
  for (let i = 1; i < letters.length; i++) {
    run = letters[i] === letters[i - 1] ? run + 1 : 1;
    if (run >= 4) {
      block(
        `Drill key has a run of ${run}+ identical answers around position ${i + 1} ` +
          `(letter ${letters[i]}). Break up the run and update ${file}.`
      );
    }
  }

  // Distribution OK -> allow the turn to end.
  process.exit(0);
})();
