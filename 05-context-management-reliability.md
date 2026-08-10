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

## To expand

- [ ] Context window management; compaction / `/compact`; long-running agents
- [ ] Prompt caching (TTL, cache breakpoints, cost)
- [x] Batch API SLA timing budget *(done — see above)* · still to cover: token counting, batch mechanics (submit/poll/results, 50% discount)
- [ ] Effective context engineering for agents (Anthropic guide)
