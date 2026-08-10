---
name: drill
description: Run CCA-F practice drills correctly — hidden answer key, even A/B/C/D distribution, plain-text stems, one question at a time. Invoke whenever the user asks for practice/drill/quiz/mock questions.
---

# Drill procedure (CCA-F)

Follow these steps exactly. They exist because the model has repeatedly (a) revealed the
answer key up front and (b) skipped even A/B/C/D distribution. The Stop hook
`drill-distribution-check.js` deterministically blocks the turn if the key file shows an
illegal distribution, so step 2 is not optional.

## 1. Plan the hidden key FIRST
Before writing any question, decide the correct-answer letter for every question in the set.
Constraints for a set of N questions:
- Each of A/B/C/D used roughly evenly (for N=10: each 2–3 times).
- No letter used more than ~3× in 10 (scale proportionally for other N).
- No run of the same letter 4+ times in a row.

## 2. Write the key to the hidden file — NEVER to the chat
Write the planned key as JSON to `.claude/.drill-key.json` in the project root (this exact
path — the Stop hook reads it there; it is gitignored). Shape:

```json
{ "key": ["C","A","D","B","A","C","B","D","A","C"], "revealed": 0 }
```

- `key`: the full planned answer sequence.
- `revealed`: how many answers you have already disclosed to the user (starts at 0).

The Stop hook reads this file and blocks the turn if `key` violates the distribution rules.
The user must NEVER see this file's contents, the key array, or any future answer.

## 3. Plain-text stems
Write question stems in plain text. Do NOT bold or italicize any phrase that gives away the
answer. Save emphasis of the decisive cue for the explanation you give AFTER the user answers.

## 4. One question at a time
Present exactly one question. Stop and wait for the user's answer. Do not preview later
questions or their letters.

## 5. Reveal only after the user answers
When the user answers a question, reveal whether it was right, explain the decisive cue, then
increment `revealed` in the key file. Only then present the next question.

## 6. Never disclose the scheme
Never print the key array, the planned letter sequence, "the answers are…", or a table of
upcoming answers. If you catch yourself about to, stop — that defeats the drill.
