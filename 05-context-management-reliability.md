# Domain 5 — Context Management & Reliability

*Stop reasons, error handling, retries, truncation.*

---

## Stop reasons — **default to "not done"**

- `stop_reason` is **data on a 200 response**, not an error. **Errors throw; stop reasons route.**
- An **unhandled** stop reason = a silent **wrong turn**, never a crash.
- **Never fall through to `end_turn`** for an unknown value.

| Value | Meaning | Action |
|---|---|---|
| `end_turn` | Finished naturally | Use the response as-is |
| `max_tokens` | Hit your `max_tokens` limit (**truncated**) | **Resume**: append partial assistant turn, raise limit, call again until `end_turn` |
| `stop_sequence` | Emitted a custom stop sequence | Read the `stop_sequence` field |
| `tool_use` | Wants to call a tool | Execute the tool, return a `tool_result` |
| `pause_turn` | Server-tool turn **paused** mid-execution | Send the response back to continue |
| `refusal` | Model declined to respond | Check `stop_details`; retry/fallback |
| `model_context_window_exceeded` | Filled the model's context window | Treat as truncated |

> `end_turn` / `stop_sequence` = **done**. `max_tokens` / `pause_turn` = **not done** (resume/continue).

**`max_tokens` handling = resume, not retry:** append the partial assistant turn to `messages`, call again (cap the loop). Watch **mid-JSON truncation** — partial structured output may be unparseable → raise limit / regenerate / use Structured Outputs instead.

---

## Error taxonomy

| Symptom | Response |
|---|---|
| **Transient** (network, 429/500) | plain **retry** (same request) |
| **Model's own mistake** (wrong format, value present) | **retry-with-feedback** = new model call with prior output + specific error appended (self-correction) |
| **Ambiguous-but-mechanical**, format known | deterministic **transform** (only if unambiguous) |
| **Uncertain / missing value** (low-confidence flag) | **flag / escalate to human** — verify the *value*, don't reformat it |

- **retry** = same strategy (for transient). **retry-with-feedback** = *new strategy* (append the bad output + exact error so the model corrects). "Retry what?" → **a new model generation**, not a tool/network re-send.
- **A confidence signal on the *value*** promotes "fix the format" → "verify the data." Confirm the failure is at the format layer *before* applying a format-layer remedy.
- Good error messages to the model: **specific, actionable, don't repeat what it already knows.**

**Sources:** [Handling stop reasons](https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons) · [Troubleshooting tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/troubleshooting-tool-use)

---

## Batch API SLA timing budget

> **Deadline − (everything you can't control, at worst case) = your cycle interval.**

- **Message Batches API window = 24 h is a *hard upper-bound SLA*, not a tunable/compressible budget.** Plan worst-case at the full 24 h even though most batches finish in minutes — real-world speed never counts toward a *guarantee*. (Requests not done in 24 h **expire**.)
- **Worst-case wait for the next cycle = the full interval `T`** — the binding item arrives *just after* a submission fires (or a serial pre-step pushes it just past a cycle boundary).

**The one formula:**
```
worst-case latency = T + Σ(serial stages) + max(24h, longest parallel stage)
```
Set `≤ deadline`, solve for `T`.

- **Serial stage** (pre *or* post, must run before/after the batch) → **always subtracts.** "Before submission" is **not** free — a fixed pre-step just makes the item miss a cycle, costing a full `T` anyway.
- **Parallel stage** (runs *concurrently* with the 24 h window) → **free only while it fits.** Absorbed if `≤ 24`; if longer, its **overhang (`stage − 24`) becomes additive**. Capture both cases with `max(24, stage)` — not `stage` alone (that under-counts the absorbed case).
- **Serial-vs-parallel decides deduction, not before-vs-after.**

**Worked:** 36 h deadline, 24 h window, +2 h serial formatting → `T ≤ 36−2−24 = 10`. · 32 h, +20 h parallel audit → `T ≤ 32−max(24,20) = 8`. · same but 40 h audit → `T ≤ 32−40 = −8` → **impossible**; floor delivery = 40 h.

**Traps:** treating 24 h as an average you can shrink; crediting a parallel stage that *exceeds* the window as still-free; deducting a parallel-and-fits stage (it's free); assuming "pre-processing overlaps the wait so it's free" (boundary-miss makes it additive).

*(source: [platform.claude.com/docs/en/build-with-claude/batch-processing](https://platform.claude.com/docs/en/build-with-claude/batch-processing))*

---

## Review-tool trust: precision vs recall (signal-to-noise)

> **False-positive damage is a *negative externality on the whole tool* — one noisy category makes devs ignore *all* findings. Fix the noise source, don't disclaim it.**

- **Two error types, opposite fixes — always classify first:**

| Problem | = | Cost | Fix |
|---|---|---|---|
| **False positives** (noise) | low **precision** | wasted attention → **trust erosion** → tool ignored | **narrow**: disable/skip category, or **raise** confidence threshold |
| **False negatives** (misses) | low **recall** | **missed real issues** (e.g. security risk) | **broaden**: **lower** threshold / add detection guidance |

- **Precision dominates recall for *trust*.** A miss is invisible; a false finding costs triage every time → **alert fatigue** → effective recall of the *entire tool* → 0 (nobody reads it). An ignored tool has zero value, so trading recall for precision is strongly positive.
- **Scope the fix to the affected path** — never global (blast-radius reflex → [90](90-cross-cutting-reflexes.md)).
- **Broken category under repair → disable temporarily + iterate offline (evals) + re-enable.** "Temporarily"/"re-enable" are load-bearing — it's a reversible pause, not abandonment. *Marginally* noisy → raise the bar instead of skipping.
- **Mechanisms:** skip rules (category/path/branch) · confidence threshold (default **80**, 0–100) · **verification pass** (agents try to *disprove* each finding → Anthropic's <1% FP; ties to **evaluator-optimizer / adversarial-verify**, Domain 1).

**Traps:** *lowering* the threshold to fix noise (wrong way — adds noise); a **disclaimer** instead of removing the noise (devs still pay the triage tax); disabling the **whole** tool (kills good categories — not surgical); reusing the last scenario's move without re-checking **FP vs FN** — disabling a *trusted-but-low-recall* category makes safety worse; changing settings **globally** when only one path is affected (wrecks trust elsewhere).

*(source: [code.claude.com/docs/en/code-review](https://code.claude.com/docs/en/code-review) · [code-review plugin README](https://github.com/anthropics/claude-code/blob/main/plugins/code-review/README.md))*

---

## Confidence calibration for human-review routing

> **Routing needs *monotonicity*, not perfect calibration. Diagnose the *ordering* first, the *gap* second.**

- **Calibration** = confidence ≈ empirical accuracy (measure: **ECE**, reliability diagram). LLMs trend **overconfident**; calibration is **range-local** (fine in one band, off in another).
- **"Route below X to a human" silently assumes monotonic calibration** — the precondition the exam loves to violate.

| Reliability-diagram pattern | Usable for routing? | Action |
|---|---|---|
| **Inverted / non-monotonic** (low-conf bucket *more* accurate) | **No** — can't rank | Don't naive-threshold; **investigate** (confounders, per-bucket n, full curve) |
| **Flat** (accuracy ~constant across buckets) | **No** — no discriminative signal | Confidence can't route → find **another signal** |
| **Monotonic**, even if overconfident | **Yes** — as a *ranking* signal | Threshold on the **empirical accuracy curve** (± recalibrate) |
| **≈ accuracy** (well-calibrated) | **Yes** — near-directly | Use raw scores; auto-accept where empirical acc ≥ bar |

- **Gap magnitude ≠ usability — ordering decides.** A large overconfidence gap is survivable *if monotonic*; check the order, not the size of the gap.
- **Ranking suffices for threshold routing; true-probability math (expected value / cost) needs recalibration** (isotonic/Platt), not just ranking.
- A confidence score is a **claim, not truth** → [conformance ≠ correctness, D4](04-prompt-engineering-structured-output.md); low-confidence *value* → verify, don't reformat (error taxonomy above).

**Traps:** "miscalibrated → unusable → route all to humans" (over-reach — monotonic is usable); feeding raw overconfident scores into probability math; **fixed-offset** recalibration (assumes a uniform gap); calling a **flat/no-signal** curve "well-calibrated."

*(source: [anthropic.com/engineering/demystifying-evals-for-ai-agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) · ECE / reliability diagrams / isotonic recalibration)*

---

## Structuring multi-part work — batch vs. chain vs. fan-out

> **Two independent axes decide the shape. Dependency decides *ordering* (chain vs. not); context-load/isolation decides *where* (one context vs. many). Evaluate them per-item, not for the group.**

**Axis 1 — dependency (does step B need step A's *output*?):**
- **No dependency → do not chain.** Independent items can share one message.
- **Dependency → chain/stage.** B is written/diagnosed against A's actual result; running them together (or in parallel) makes B work against stale state.

**Axis 2 — context load / isolation (given independence, how heavy is each item?):**
- **Light enough to hold together → batch** in one message. Independence is *necessary but not sufficient* for batching.
- **Too heavy / too many to fit, or reads flood the main thread → fan out** to parallel `claude -p` invocations or subagents.

| Dependent? | Heavy / many / reads-heavy? | Shape |
|---|---|---|
| Yes (B needs A) | — | **Chain** — sequential, share context. Never parallelize (B sees stale state). |
| No | No (small, cheap) | **Batch** — one message, full context, one pass. |
| No | Yes | **Fan out** — parallel invocations (`--allowedTools` scoped) or a research subagent that reports a summary. |

- **Passes ≈ dependency-edges + 1.** Zero edges → one batched pass; one edge → two stages; etc. "Related / same file" is **not** an edge — locality ≠ dependency.
- **Mixed batch splits along the weight seam, not down the middle:** 4 one-line fixes + 1 heavy investigate → batch the 4, isolate the 1 (subagent). *(the "5 fixes" case)*
- **Ordering-dependency ≠ inspection-dependency.** *Sequential and self-carrying* (refactor → changelog → PR) → **one ordered prompt**; Claude runs the chain internally. *Sequential but you must see/gate on the middle* (confirm the return type before diagnosing bug 2; "review the plan before coding") → **chain across turns**. Modern models handle multi-step *reasoning* internally, so explicit chaining now earns its keep mainly when **you** need the intermediate surfaced (inspect / branch / log).
- **File-count is a *proxy* for context load, never the trigger.** 40 typo fixes may batch; 5 large-module reads may need fan-out. Boundary = "does the combined context fit *with headroom*," not a task count. On the exam, a specific number in the stem is usually the distractor; the real cue is "large / reads many files / isolated / in parallel."
- **Fan-out also buys wall-clock parallelism** — but that's a throughput choice, not a correctness one; exam correctness answers key off context, not speed.

**Traps:** "same function/module ⇒ batch" (locality masquerading as independence — Q of the reconciliation-function type); "independent ⇒ *always* batch" (ignores heavy item — over-crams context); "sequential ⇒ split into messages" (ignores self-carrying case — needless round-trips); fanning out featherweight edits (sledgehammer — subagents need independence **and** weight); parallelizing a dependent chain (B reads stale state).

*(source: [code.claude.com/docs/en/best-practices](https://code.claude.com/docs/en/best-practices) · [prompt-engineering: chain complex prompts / subagents](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices))*

---

## `/clear` vs. `/compact` — relevance vs. volume

> **Degraded output in a long session has two different causes with opposite fixes. Diagnose the cause before reaching for a command.**

| Cause | Symptom | Fix |
|---|---|---|
| **Pollution** (irrelevant context — the "kitchen sink") | you switched topics mid-session; old topic bleeds into the new | **`/clear`** between unrelated tasks (or after 2 failed corrections — the context is cluttered with dead ends) |
| **Volume** (relevant context, but full) | deep in *one* problem, history all on-topic, nearing the ceiling | **`/compact`** — lossy summarization that keeps code/decisions, drops verbose transcript. Not `/clear` (that discards the signal). |

- **Context economy = keep it *relevant*, not keep it *small*.** When you're deep in one complex problem and the history is directly relevant, **letting it accumulate is correct** — don't clear it. ("smaller window always faster" is the overcorrection trap.)
- **Compaction is lossy and model-judged** → for anything critical, **pin findings to a file** (scratchpad / NOTES.md) *before* compacting; a file survives compaction, `/clear`, and session close. Steer with `/compact <focus>` or a CLAUDE.md "when compacting, preserve…" line. `Esc+Esc` → *Summarize from here* compacts only a chosen span.
- **`/clear`-then-repaste ≠ compaction** — pure churn; use `/compact`.

**Traps:** `/clear` on a relevant-but-full session (throws away signal); "bigger window" for a *pollution* problem (just holds more noise); treating a *volume* problem as a prompt problem (more detail in a polluted context doesn't help); trusting lossy compaction alone for must-keep findings.

*(source: [code.claude.com/docs/en/best-practices](https://code.claude.com/docs/en/best-practices) — context management, failure patterns)*

---

## Self-verification — legitimate when the judge is external

> **"Give Claude a check it can run" is sound *because the arbiter is an external oracle* (tests/build/lint/fixture-diff), not the model's own judgment. Self-*judgment* with no oracle is the weak form.**

Verification strength, strongest → weakest:
1. **Deterministic external gate** — Stop hook / CI running real tests. Model can't fudge a red exit code.
2. **Independent adversarial reviewer** — fresh subagent sees only the diff, prompted to refute (not a fork — a fork inherits the bias). For judgment tests can't cover.
3. **Self-check against an external oracle** — model runs its own tests and iterates until pass. Good: runner is the author, but the *arbiter* is external. ← the default "verification loop."
4. **Self-judgment, no oracle** — "does this look right?" Weakest; confirmation bias applies fully.

- Unattended runs escalate 3 → 1/2 (Stop hook, `/goal` condition, review subagent) — "the agent doing the work isn't the one grading it."
- Counter-trap: a reviewer prompted to find gaps *will* find some even when the work is sound → over-engineering. Tell it to flag only correctness/requirement gaps.

**Traps:** calling self-verification an anti-pattern wholesale (only level 4 is weak; level 3 is recommended); relying on level 4 for high-stakes work; chasing every adversarial finding.

*(source: [code.claude.com/docs/en/best-practices](https://code.claude.com/docs/en/best-practices) — verify your work, adversarial review · ties to D1 evaluator-optimizer)*

---

## To expand

- [x] Context window management; compaction / `/compact`; long-running agents *(done — see "batch vs. chain vs. fan-out", "/clear vs /compact", "self-verification" above)*
- [ ] Prompt caching (TTL, cache breakpoints, cost)
- [x] Batch API SLA timing budget *(done — see above)* · still to cover: token counting, batch mechanics (submit/poll/results, 50% discount)
- [ ] Effective context engineering for agents (Anthropic guide)
