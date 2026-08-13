# Drill skill — ChatGPT / Codex version

A skill for running **CCA-F practice drills** that avoids three habits that undermine practice:
the model **revealing answers early**, **skewing the A/B/C/D distribution** (toward B/C, starving
D), and **telegraphing the answer** via formatting or option length.

This is the **portable, instructions-only** version. It follows the
[Agent Skills open standard](https://learn.chatgpt.com/docs/build-skills) — a folder with a
`SKILL.md` — so it works in ChatGPT and Codex.

## How this differs from the Claude Code version

The original (Claude Code) setup had two halves:
- a **skill** carrying the authoring rules (this file's `SKILL.md`), and
- a **Stop hook** — code that ran automatically when the model finished its turn and **blocked**
  the turn if the answer distribution was skewed. That made even distribution a *guarantee*.

**ChatGPT and Codex have no hook mechanism.** Per OpenAI's own docs, a skill is invoked by the
model's decision (or your explicit "use the drill skill"), and there is no turn-end/stop event
that runs your code unconditionally. So the hook cannot be ported.

**What that means, honestly:**

| Rule | Claude Code | ChatGPT / Codex |
|---|---|---|
| Plain-text stems, balanced options, one-at-a-time, reveal-after | instruction | **instruction (same)** |
| Even A/B/C/D distribution | **guaranteed** (hook blocks skew) | **asked-for, not guaranteed** |

The distribution rule here relies on the model following step 1 (plan the whole key first). Strong
models often do this well; it is not enforced. If you need a hard guarantee across arbitrary
models, that belongs in a wrapper you control (see "If you need a real guarantee" below), not in a
skill.

## Install

**ChatGPT** (Business/Enterprise/Edu, where Skills are available):
1. Skills → create a skill (or import a folder).
2. Provide this `SKILL.md` as the skill body.
3. In a chat, invoke with `@drill` (or just ask for practice questions and let it match).

**Codex** (CLI / IDE):
1. Put this `drill/` folder under a skills directory Codex scans. Codex reads `.agents/skills/`
   from your working directory up to the repo root (repo scope), plus `~/.agents/skills/` (user
   scope). In this repo it already lives at `.agents/skills/drill/`, so a checkout is picked up.
2. Invoke with `/skills` or `$drill`.

Either way the skill is **instructions only** — nothing to run, no dependencies.

## Verify it actually stays balanced (recommended)

Because distribution is not enforced here, measure it before trusting it on your model. The
`test/` folder has a protocol and a tally script:

1. Follow `test/PROTOCOL.md` — run ~200 pooled drill answers across mixed/hard/easy sets.
2. Record each drill's correct-answer letters into `answers.txt` (see `test/answers.example.txt`).
3. `node test/tally.js answers.txt` → prints the distribution and a PASS/FAIL verdict, flagging
   D-starvation and B-crowding specifically.

A PASS means "sufficient **for the model you tested**" — it is a snapshot, not a portable
guarantee. A different model may skew differently.

## If you need a real guarantee (any LLM)

Move enforcement out of the chat into a thin wrapper you control: pick a balanced A/B/C/D key in
code, ask the LLM to write questions for those pre-assigned slots, validate the returned
distribution, and regenerate on skew. That logic is provider-agnostic (~30 lines, no vendor
lock-in) — it's the same audit the Claude Stop hook did, driven by your loop instead of a hook.
