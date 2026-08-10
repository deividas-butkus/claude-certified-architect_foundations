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

There is no keygen/reveal step during the drill. Those approaches leak because their output is
visible. (`drill-keygen.js`/`drill-reveal.js` may exist in the repo but MUST NOT be used to
read answers into the chat.)

## 1. Plan the hidden key in your head, and hold it in reasoning
Before writing questions, decide the correct-answer letter for every position. Constraints for
N questions:
- Each of A/B/C/D used roughly evenly (for N=10: each 2–3 times).
- No letter more than ~3× in 10 (scale for other N).
- No run of the same letter 4+ times in a row.

Keep this sequence in your reasoning. Do NOT print it, write it, or echo it anywhere.

## 2. Plain-text stems
Write question stems in plain text. Do NOT bold or italicize any phrase that gives away the
answer. Save emphasis of the decisive cue for the explanation AFTER the user answers.

## 3. One question at a time
Present exactly one question with its four options, placing the correct option at the letter
you planned for that position. Stop and wait. Do not preview later questions or their answers.

## 4. Reveal only after the user answers
After the user answers, state right/wrong and explain the decisive cue — all from your own
reasoning, in prose. Then present the next question. Never reveal a future question's answer.

## 5. Record the key ONLY at the very end, for the Stop-hook audit
After the LAST question is answered and scored, write the full key you actually used to
`.claude/.drill-key.json` (gitignored) via a single silent command so the Stop hook can audit
distribution:

```
node "$CLAUDE_PROJECT_DIR/.claude/hooks/drill-keygen.js" --record A C D B ...
```

Because the drill is already over, this is not a leak — every answer has been disclosed. If
the recorded distribution is illegal the Stop hook blocks, signalling you skewed the key;
fix future sets accordingly. (During the drill, the file may be absent — that is fine; the
hook only audits when the file exists.)

## 6. Never disclose the scheme
Never print the key array, the planned sequence, "the answers are…", a table of upcoming
answers, or any slot via tool output during the drill. If you catch yourself about to, stop.
