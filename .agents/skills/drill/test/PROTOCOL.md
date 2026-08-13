# Drill distribution test — does the skill hold on its own?

Goal: measure whether the drill **skill alone** (no Stop hook) produces an even A/B/C/D
distribution on a given model — with special attention to whether **D is starved** and **B
crowds**, the original failure pattern. A pass means "sufficient for this model," not "guaranteed."

## Why this design
- **Single drills prove nothing** — chance gives even-ish 10s sometimes. Skew shows in the *pooled*
  aggregate, so we run many drills and combine all answers.
- **The tail matters more than the mean** — the model can average ~25% while still almost never
  using D. We check per-letter *minimum* representation, not just closeness to 25%.
- **Stress the model** — include long sets and "one obviously-right answer" topics, where skew
  surfaces. Easy short drills flatter the skill and prove least.

## Sample size
Aim for **~200 pooled answers**. E.g. 10 drills × 20 questions, or 20 drills × 10.
Below ~120 the noise is too high to trust a "looks fine."

## Run it (on Codex, with the drill skill available)

1. Mount/enable the drill skill (`/skills`, or `$drill`).
2. Run each prompt below as a separate drill. **Actually answer** each question (any answer — the
   content doesn't matter, only where the correct letter lands). After each drill, the model states
   the correct letter per question; that's what you record.
3. For each drill, note the correct-answer letters **in order** as a string, e.g. `ACDBBACDDB`.
   (You are the auditor here — there's no hook catching skew during the test.)

### Prompt set (mix of length + difficulty, to stress skew)
Run these; repeat the set if you want more volume.

1. "Give me 20 CCA-F practice questions on MCP scopes and precedence."
2. "20 questions on Claude Code hooks and settings."
3. "20 questions on prompt engineering and structured output."
4. "20 questions where the correct answer is genuinely tricky — subtle distinctions, no obvious throwaway."
5. "20 quick, easy questions on Claude Code basics."      ← easy set: skew often worst here
6. "20 questions on agentic orchestration and reliability."
7. "Another 20, mixed topics, harder than average."
8. "20 more, mix in some where one option looks obviously right but isn't."
9. "20 questions on context management."
10. "A final 20, any CCA-F topic."

## Tally

Paste every recorded letter-string into `answers.txt` (one drill per line, letters only,
e.g. `ACDBBACDDB` — see `answers.example.txt` for a worked file). Then, from this `test/` folder:

```
node tally.js answers.txt
```

(Parsing is loose: commas, spaces, and lowercase are fine; non-A/B/C/D chars are skipped.)

## Reading the result — pass / fail

The script prints per-letter counts, %, the min/max spread, and longest run. Judge by:

- **PASS** if: each letter is within roughly **20–30%** of the pool, **D ≥ ~20%** (not starved),
  and no letter exceeds ~30%. → skill alone is sufficient *for this model*; no wrapper needed.
- **FAIL** if: any letter (watch D) falls **below ~18%**, or B (or any) climbs **above ~32%**,
  or there's a persistent long run. → the skill nudges but doesn't guarantee; keep the Stop hook
  (Claude) or use a wrapper (cross-LLM).

Remember: a pass is a **snapshot of one model**. A different model your colleague runs may skew
differently — that model-independence gap is exactly why the deterministic hook exists.
