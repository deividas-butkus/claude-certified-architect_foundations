# Cross-Cutting Reflexes & Exam Tactics

*The domain-agnostic judgment that the exam actually tests. Re-read before every practice set.*

---

## When two answers are both defensible — match the tier to the verb

**Underline the demand word in the stem, then pick the tier it names.**

| Qualifier in the stem | Pick the… |
|---|---|
| *guarantee / never / must / exactly one of* | **enforce** (strongest — code / constraint / hard gate) |
| *simplest / most direct / quickest / first step / lowest-effort* | **lightest sufficient** (examples, prompt-level) |
| *minimize X **while still** Y / balance* | **proportional middle** (often `ask`) |
| *outside the hook's concern / no policy* | **defer** |

> Two answers can both be "correct-ish"; the question is engineered so the one matching the **verb** wins. When stuck, re-read the stem and underline the verb.

---

## Distractor patterns to distrust

- **Fabricated mechanism** — fluent, technical, but invents a false causal link (e.g. "subdirectories disable `paths` scoping").
- **Concede-then-mislead** — concedes the true part to slip the false part past ("files *are* discovered, *but…*").
- **Right tool, wrong question** — a correct technique the qualifier excluded.
- **The temperature knob** — offered whenever the real issue is an unanchored target or a needed guarantee.
- **Same wording, flipped context** — an option that was correct on a previous item, wrong here (watch confidence flags, reversibility, verified-state).
- **Efficiency / diligence bait** — "try first," "gather more," "reduce the amount" — plausible but violates an explicit request or a guardrail.
- **Over-block / flatten** — treating every case with maximum strictness (`deny` everything) instead of proportionally.

---

## Resolution model — context vs config (three ladders, two directions)

**First ask: is this *context* or *config*?** Instructions = context → everything is **added** (concatenated), nothing discarded. Skills & MCP = config → **exactly one** definition is selected, the rest discarded.

| Type | Conflict behavior | Direction (winner) | Merged? |
|---|---|---|---|
| **CLAUDE.md / rules** | all loaded; contradictions resolved softly/arbitrarily | broad loads first, **closer read last** | **Yes — concatenated** |
| **Skills / commands** | one wins by name | **Enterprise > Personal > Project > bundled** | No |
| **MCP servers** | one wins — by name (scopes) / endpoint (plugins, connectors) | **Local > Project > User** > Plugins > connectors | No |

⚠️ **The direction trap:** skills and MCP point **opposite ways**. Skills lean **personal** (Personal beats Project); MCP leans **narrow/here** (Local & Project beat User). Never assume one rule covers both.
- Mnemonic: **"Skills = me first · MCP = here first."**
- A config winner takes its **whole entry** — fields never merge across layers.
- **bundled** skills are the **weakest** rung (overridable), not a default that wins.
- **Enterprise skills = undocumented** — managed policy pushes *settings & CLAUDE.md*, but no documented *skills* path; top usable rung is Personal.

*(detail: [D2 MCP scopes](02-tool-design-mcp.md) · [D3 skills & instructions](03-claude-code-config.md))*

---

## Core reflexes (one-liners)

- **Context or config?** Context is *added* (concatenated, nothing dropped); config *selects one* (rest discarded). Then mind the **direction trap** — skills = me first (Personal > Project), MCP = here first (Local > Project > User); opposite ways. *(D2/D3)*

- Verification gates **actions, not audiences** — *authenticate ≠ authorize*.
- **`deny` stops the action, not the agent** — the reason returns to the model.
- A **guarantee** needs **code, not a prompt** — enforce with hooks / constrained decoding.
- Fix the error **where it originates** — model output vs external tool.
- Default any **unknown stop reason** to **not done** — never fall through to `end_turn`.
- **Anchor → bound → enforce** for output conformance.
- Outside your hook's lane → **defer**, don't force `allow`.
- Preference overrides the *efficiency default*, never a *guardrail*.
- A held/denied action should always come with a clear, respectful **why**.
- Read the **preconditions literally** ("verified + new device" ≠ "unverified").
- **Don't grade your own homework** — unbiased review needs a **fresh context** (subagent, *not* a fork — a fork inherits the bias); then **find → adversarially verify** each finding (demand a repro, not an opinion). Independence buys recall; verification buys precision. *(D1/D5)*
- **Scope the blast radius** — tune/allow/deny at the **narrowest unit** (path · server · category), never globally; a fix for one area must never degrade a trusted one. *(permissions · MCP loading · review-tool tuning)*
- **Conformance ≠ correctness** — a schema/`strict` guarantee gives *shape*, never *truth*; still validate the value. *(D4)*
