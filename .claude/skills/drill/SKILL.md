---
name: drill
description: Run CCA-F practice drills correctly — answers held in the model's reasoning only (never in visible tool I/O), even A/B/C/D distribution, plain-text stems, one question at a time. Invoke whenever the user asks for practice/drill/quiz/mock questions.
---

# Drill procedure (CCA-F)

Follow these steps exactly. They exist because the model has repeatedly leaked the answers to
the user and skewed the A/B/C/D distribution.

## The one hard rule about leaks
EVERY tool call the model makes — Bash stdout, Write/Edit diffs, Read output — is rendered in
the user's chat. Therefore the correct answer must NEVER pass through any tool while the drill
is in progress. Do not write the key to a file mid-drill, do not `echo`/`cat`/`reveal` a slot,
do not Read the key back. The answer for each question lives ONLY in the model's own reasoning
until the user has answered that question. The model states the verdict from memory, in prose.

The only script involved is `scripts/record-drill-key.js`: it clears stale state at the start
(step 0) and writes the used key at the very end (step 5). Both calls are silent. Never use any
script to print or read an answer into the chat.

## 0. Clear stale key state before starting
The key file persists between drills. Before asking the first question, clear it so a previous
drill's key cannot trigger a spurious Stop-hook block on this turn. Single silent command:

```
node "$CLAUDE_PROJECT_DIR/.claude/skills/drill/scripts/record-drill-key.js" --clear
```

## 1. Plan the hidden key in your head, and hold it in reasoning
Before writing questions, decide the correct-answer letter for every position. Aim for:
- Each of A/B/C/D used roughly evenly (for N=10: each 2–3 times).
- No run of the same letter 4+ times in a row.

These are targets to aim tighter than the hard limits. The Stop hook only *blocks* when a letter
exceeds `ceil(N/4)+1` (e.g. 4 for N=10) or a letter runs 4+ in a row — so aiming for an even 2–3
spread keeps you comfortably inside the audit.

Keep this sequence in your reasoning. Do NOT print it, write it, or echo it anywhere.

## 2. Plain-text stems
Write question stems in plain text. Do NOT bold or italicize any phrase that gives away the
answer. Save emphasis of the decisive cue for the explanation AFTER the user answers.

## 2a. Balanced options (length symmetry + plausible distractors)
Within each question, make the four options hard to tell apart by shape alone:
- **Length symmetry:** keep all four roughly equal in length, sentence structure, and technical
  complexity. Never let the correct answer be the longest or most detailed — that leaks it.
- **Plausible distractors:** every wrong option should reflect a real misconception someone who
  half-knows the material might hold. No obvious throwaways or joke answers.
These are per-question qualities — you can balance them while writing each question; there is no
hook that checks them, so they rely on you applying the rule.

## 3. One question at a time
Present exactly one question with its four options, placing the correct option at the letter
you planned for that position. Stop and wait. Do not preview later questions or their answers.

## 4. Reveal only after the user answers
After the user answers, state right/wrong and explain the decisive cue — all from your own
reasoning, in prose. Then present the next question. Never reveal a future question's answer.

## 5. Record the key ONLY at the very end, for the Stop-hook audit
This step is NOT optional. The Stop hook can only audit distribution when the key file exists —
if you skip recording, no file is written, the hook silently allows the turn, and a skewed key
ships unchecked. Recording is what turns the distribution rule from a suggestion into a guarantee.

After the LAST question is answered and scored, write the full key you actually used to
`.claude/.drill-key.json` (gitignored) via a single silent command so the Stop hook can audit
distribution:

```
node "$CLAUDE_PROJECT_DIR/.claude/skills/drill/scripts/record-drill-key.js" A C D B ...
```

Because the drill is already over, this is not a leak — every answer has been disclosed. If
the recorded distribution is illegal the Stop hook blocks, signalling you skewed the key;
fix future sets accordingly. (During the drill, the file may be absent — that is fine; the
hook only audits when the file exists.)

## 6. Never disclose the scheme
Never print the key array, the planned sequence, "the answers are…", a table of upcoming
answers, or any slot via tool output during the drill. If you catch yourself about to, stop.
