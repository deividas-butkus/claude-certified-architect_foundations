# Drill system — design & setup

This directory holds a self-contained system for running **CCA-F practice drills** in Claude Code
without two recurring failure modes: the model **leaking answers** into the chat, and the
**A/B/C/D answer distribution skewing** (drifting to B/C so you pattern-match position instead of
reasoning).

The design principle throughout: **hook what dumb code can prove and what fails silently; instruct
what needs judgment and is self-evident while writing.** A guarantee needs code, not a prompt.

## The three pieces

| Piece | Location | Kind | Job |
|---|---|---|---|
| **`drill` skill** | `.claude/skills/drill/SKILL.md` | procedure (instructions) | The playbook: leak-avoidance, plain-text stems, balanced options, one-question-at-a-time, and the even A/B/C/D spread. Invokes on any drill/quiz/practice request. |
| **Stop hook** | `.claude/hooks/drill-distribution-check.js` | enforcement (code) | The only piece that *guarantees* anything. Fires when the model ends its turn; audits the recorded key and **blocks the turn** if the distribution is skewed. |
| **`record-drill-key.js`** | `.claude/skills/drill/scripts/record-drill-key.js` | helper (code) | The skill calls it to `--clear` stale state at drill start and to record the used key at drill end — both **silently**, so answers never reach the chat. |

## Why the split (skill vs. hook)

- **Even distribution** is a *global* property that fails *silently* (a skewed quiz looks perfect)
  and can't be self-audited mid-generation (the model can't reliably count where answers landed).
  → needs the **Stop hook** (deterministic code that counts and blocks).
- **Plain-text stems, length symmetry, plausible distractors, one-at-a-time** are *per-question
  judgment* calls, visible in the moment. → live in the **skill** as instructions; no hook.

## Data flow

```
/drill invoked
  └─ step 0: record-drill-key.js --clear      → removes any stale .drill-key.json
  └─ questions asked one at a time            → answers live ONLY in the model's reasoning
  └─ step 5: record-drill-key.js A C D B ...   → writes {"key":[...]} to .drill-key.json
model ends turn
  └─ Stop hook reads .drill-key.json          → counts letters; ALLOW or BLOCK-with-fix-reason
```

`.claude/.drill-key.json` is the **handoff file** between the writer (skill helper) and the reader
(Stop hook). It is **gitignored** — per-user throwaway state, one drill's key at a time.

## Distribution rules the hook enforces

For a key of length `n` (see `drill-distribution-check.js`):
- **Per-letter cap:** no letter appears more than `ceil(n/4)+1` times (e.g. 4 for n=10).
- **Run cap:** no letter appears 4+ times **in a row**.

Short runs (up to 3 in a row) are *intentionally allowed* — forbidding all repeats would itself be
a predictable pattern. The skill tells the model to aim tighter (even 2–3 spread) so the hard cap
rarely trips.

## Setup for a teammate (cloning this repo)

1. **Node.js** must be on `PATH` — both the hook and the helper are `node` scripts.
2. The Stop-hook wiring lives in **`.claude/settings.json`** (tracked, shared). No per-user setup
   needed; Claude Code picks it up automatically. (`settings.local.json` is personal and
   git-ignored — do not put shared hook wiring there.)
3. `$CLAUDE_PROJECT_DIR` is set by Claude Code; the scripts rely on it to locate the key file.
4. Nothing to install — the scripts use only Node built-ins (`fs`, `path`).

## Verify it works

```sh
# Record a good (balanced) key, then run the hook — should allow (empty output, exit 0):
node .claude/skills/drill/scripts/record-drill-key.js A B C D A B C D
echo '{}' | node .claude/hooks/drill-distribution-check.js

# A skewed key should BLOCK with a fix reason:
printf '{"key":["B","B","B","B","B"]}' > .claude/.drill-key.json
echo '{}' | node .claude/hooks/drill-distribution-check.js   # → {"decision":"block", ...}

# Clean up:
node .claude/skills/drill/scripts/record-drill-key.js --clear
```

## Known sharp edge

The distribution *guarantee* depends on the skill actually calling the recorder at drill end. If
that step is skipped, no key file is written and the Stop hook allows the turn unaudited. Step 5
of the skill is marked non-optional for this reason.
