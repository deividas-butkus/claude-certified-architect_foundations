#!/usr/bin/env node
// UserPromptSubmit hook (CCA-F project only): when the user asks for
// practice/drill/quiz questions, inject a reminder about stem formatting
// and answer-key distribution. On non-matching prompts, emit nothing.

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let prompt = "";
  try {
    prompt = (JSON.parse(raw || "{}").prompt || "").toString();
  } catch {
    process.exit(0);
  }

  const re =
    /\b(drills?|practice\s+question|quiz|mock\s+exam|mcqs?|multiple[-\s]+choice|(give\s+me\s+)?\d+\s+(qns?|questions?|q)\b|\d+\s+(drills?|practice|quiz))/i;

  if (!re.test(prompt)) process.exit(0);

  const additionalContext =
    "Drill-authoring rules (user preference): " +
    "(1) Write question stems in PLAIN TEXT — no bold or italic on any phrase that gives away the answer; " +
    "save emphasis of the decisive cue for the explanation AFTER the user answers. " +
    "(2) Rotate the correct-answer letter roughly evenly across A/B/C/D — for a set of 10, each letter about 2–3 times, " +
    "no letter more than ~3×, and avoid long runs of the same letter. Plan the answer key before writing.";

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext,
      },
    })
  );
  process.exit(0);
});
