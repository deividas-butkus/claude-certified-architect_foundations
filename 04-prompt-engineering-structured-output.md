# Domain 4 — Prompt Engineering & Structured Output

*Anchoring behavior, examples, Structured Outputs API.*

---

## The anchoring ladder

> **describe → demonstrate → declare → enforce** *(strength increases →)*

| Tier | Means | Strength |
|---|---|---|
| **describe** | adjectives ("concise", "clean") | weakest — subjective, ambiguous |
| **demonstrate** | 2–3 examples ("show, don't tell") | anchors length/style/format |
| **declare** | explicit rule / enumerated closed set | states the boundary (strong nudge) |
| **enforce** | Structured Outputs `enum` / validation / formatter | **the only guarantee** |

- Examples **teach the pattern (within range)**; explicit rules **generalize** it; validation **enforces** it.
- Show **varied input → constant output** to teach an **invariant** (e.g. summary length independent of article size).
- Include **edge cases** and a **complete** label set (add `Mixed`), or the model invents off-list values.
- A **number/count** ("2–3 sentences") is a valid anchor (unlike adjectives); sentence-count beats word-count (model counts it better, easy to validate).
- **Temperature is never the answer** to an *unanchored target* — it reshapes sampling, not conformance.
- Anthropic guidance: examples clarify what description can't; "a single good example often beats three paragraphs of instructions." Advanced models mirror example details closely — keep examples clean.

---

## Structured Outputs API

**Current (GA — no beta header):**
```json
"output_config": {
  "format": { "type": "json_schema", "schema": { /* JSON Schema */ } }
}
```
- **Legacy (transition):** `output_format` param + header `anthropic-beta: structured-outputs-2025-11-13` (still works, being phased out).

**Strict tool use** — guarantees schema-valid tool names & inputs:
```json
{ "name": "…", "strict": true,
  "input_schema": { "type": "object", "properties": {…},
    "required": [...], "additionalProperties": false } }
```

**Closed set / `enum`** — standard JSON Schema keyword:
```json
{ "type": "string", "enum": ["Billing", "Technical", "Account", "Other"] }
```
- ⚠️ **Capitalization is NOT guaranteed** for `enum`/`const` — Claude may differ only in case. **Compare case-insensitively.**

**Supported models:** Fable 5, Mythos 5, Opus 4.8/4.7/4.6/4.5, Sonnet 5/4.6/4.5, Haiku 4.5.

> Constrained decoding = **prevention** (invalid tokens never generated) — the *enforce* tier for a model's **own** output. It cannot constrain external tool results (use a `PostToolUse` hook — see [Domain 1](01-agentic-architecture-orchestration.md#origin--enforcement-layer)).

**Sources:** [Structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) · [Prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/multishot-prompting)

---

## Conformance ≠ correctness

> **`strict: true` / Structured Outputs guarantee *shape*, never *truth*. You can get a perfectly-typed wrong answer.**

- Grammar-constrained decoding enforces **structural/type** conformance ("`quantity` is an integer") — it says **nothing about semantic correctness** ("is it the *right* integer?"). `47` and `74` are equally schema-valid.
- **The counterintuitive risk: strict can *induce* fabrication.** A **required** field the model can't determine (illegible OCR, missing source) → it must emit *some* type-valid value → invents a plausible one. Strict guarantees you *get* an integer, making a silent wrong value **more** likely, not less.
- **`enum` narrows the value set, still not correctness** — one of the 4 labels, not the *right* one. Same gap, tighter.
- **To reduce wrong-but-well-typed values (semantic layer):**
  1. **nullable / "unknown" escape path** + instruct "return `null` when illegible/uncertain" → model *declines* instead of confabulating → route to human. *(the highest-leverage fix)*
  2. **business-plausibility validation** downstream — range/sign/outlier, cross-reference the source, reconcile totals.
  3. **flag/escalate outliers**; scale rigor to business impact (inventory, payments…).
  4. field **`description`s** reduce semantic errors (probabilistic nudge, *not* a guarantee).
- **Origin fit:** value is **model-generated** → shape solved by Structured Outputs (prevent); wrong *content* is a **verify-the-value** problem, not a reformat one → [Domain 5 error taxonomy](05-context-management-reliability.md) (confidence on the *value* → verify data, don't retry the format).

**Traps:** treating "type-safe" as "trustworthy" (it's *necessary, not sufficient*); tightening the **type** (`integer`, `minimum:0`) to fix a **truth** problem (structural change, semantic miss); a presence check (`required` / "reject if missing") to catch *wrong* values (strict already guarantees presence — catches nothing semantic); over-swinging to "strict is useless" (it kills an entire parse/type failure class).

*(source: [platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use) — "adheres to format, not that output is accurate; may still hallucinate")*

---

## Three doors — which output am I shaping?

> **Same grammar engine, three targets. Match the *noun being constrained* to the mechanism.**

| Target (the noun in the stem) | Mechanism | Layer |
|---|---|---|
| **reply / response / answer** Claude sends back | `--json-schema` (CLI) · `output_config.format` (API) | **content** |
| **tool / function** call's **arguments / input** | `strict: true` on the tool definition | **content** (a different output channel) |
| the **CLI's stdout wrapper** (parseable object vs prose) | `--output-format json` | **envelope** |

- `--json-schema` and `--output-format json` are **not alternatives** — they **stack**. Envelope makes stdout parseable *at all*; schema shapes the answer *inside* it. The canonical CI invocation uses **both**: `claude -p "…" --output-format json --json-schema '{…}'`.
- **Keyword detector:** "tool/arguments" → `strict: true`; "reply/answer content" → `--json-schema`/`output_config.format`; "print JSON not prose" → `--output-format json`.
- `strict: true` shapes what Claude passes *into a tool*; `--json-schema` shapes what Claude *says back*. Different output channels — reaching for `--json-schema` on a tool-args problem is the classic swap.
- **`--output-format` vs `output_config.format` are different surfaces, same idea** — the first is a **CLI flag** (envelope), the second an **API parameter** (content). Don't conflate the flag with the param.

---

## `--json-schema` validation — the v2.1.205 cutover

> **2.1.205 flipped two schema behaviors in *opposite directions*: stricter on malformed schemas (fail fast), more lenient on `format` (accept). Same release, opposite moves — the classic inversion trap.**

**Anchor:** *the schema itself* is validated **at startup, before Claude runs** — separate from *model-output* validation, which happens *after* the run (re-prompt on mismatch, then error).

| Concern | ≤ 2.1.204 (old) | ≥ 2.1.205 (current) |
|---|---|---|
| **Malformed schema** (bad JSON, unescaped brace, un-parseable) | **silently ignored** → agent ran and returned **unstructured text** | **fails the run at startup**, error names the problem + validator diagnostic, **no output produced** |
| **`format` keyword** (`"format": "email"`) | schema treated as **invalid** → rejected | **accepted as a non-enforced annotation** → run proceeds |

- **Direction of each change is the whole point.** Malformed schema: got *stricter* (was tolerated, now aborts). `format`: got *more lenient* (was rejected, now allowed). Carrying "format is not allowed" into current-version questions picks the fail-fast distractor when the answer is "runs fine, `format` ignored."
- **"Accepted" ≠ "enforced."** Post-2.1.205 `format` is *permitted* (won't abort) but **not validated** — `"format": "email"` will **not** reject a non-email string. Two separate claims; don't collapse "not enforced" into "not allowed."
- **Two validation moments, don't merge them:**
  - **schema invalid** → caught **at startup**, before inference → exit + diagnostic, **no output**. *Never reaches the retry loop.*
  - **valid schema, output can't conform** → caught **after the run**, post re-prompt retries → error result, subtype **`error_max_structured_output_retries`** (Agent SDK). *(See [error subtypes](#structured-outputs-fail-two-ways-ci-parsing-lens) for the output-side failures.)*
- **Draft version is also a startup-invalid trigger:** SDK validates against **JSON Schema draft-07**; a schema declaring a newer draft (e.g. `2020-12`) is **rejected as invalid** → same startup-abort bucket. Zod defaults to 2020-12 → convert with `target: "draft-7"`.
- **Mnemonic:** *2.1.205 — stricter on structure, softer on `format`.*

**Traps:** "`format` not allowed post-2.1.205" (reversed — it's *old* behavior); routing a malformed-schema abort to `error_max_structured_output_retries` (that's *output* failure, never reached); "invalid schema returns unstructured text" (only ≤ 2.1.204); assuming a newer-draft `$schema` is fine (rejected — draft-07 only).

*(source: [Get structured output from agents — Claude Code Docs](https://code.claude.com/docs/en/agent-sdk/structured-outputs) — "A schema that isn't valid JSON Schema fails the run at startup … Before v2.1.205, an invalid schema was silently ignored"; "`format` … accepted as an annotation and isn't enforced … Before v2.1.205, any schema containing `format` was treated as invalid"; "validates schemas with JSON Schema draft-07")*

---

## Structured outputs fail two ways (CI-parsing lens)

> **Structured outputs guarantee *shape*, conditional on a complete, on-topic answer being produced. Two things break that precondition — and they fail in *opposite* ways.**

| Failure | `stop_reason` | HTTP | What the JSON looks like | Symptom downstream | Fix |
|---|---|---|---|---|---|
| **Truncation** | `max_tokens` | 200 | **unparseable** — cut off mid-object | parser **CRASHES** (loud) | raise `max_tokens` to fit the largest expected output |
| **Refusal** | `refusal` | **200** | **valid** JSON, **your schema fields missing** | wrong / missing-field verdict (**quiet**) | check `stop_reason`; treat refusal as its **own** outcome |

- **Constrained decoding is *valid-as-it-goes*, not *complete*.** Every token emitted is schema-valid, but nothing forces the model to *finish* — a `max_tokens` cutoff leaves `{"passed": true, "issues": ["missing null che` → not parseable. (Distinct from `budget_tokens`/task-budget pacing — `max_tokens` is an external ceiling the model isn't steered to respect.)
- **A refusal is a *successful* response, not an error.** HTTP **200**, `stop_reason: "refusal"`, a normal text block where your schema should be. The envelope parses fine; your fields simply aren't there. It sails past `try/except JSONDecodeError` and every plumbing check — the failure surfaces only when your code *reads* the missing field (`KeyError` / missing-as-`null`).
  - **Refused ≠ HTTP 4xx.** The decline happens at the *content* level inside a 200. Debugging fingerprint: **green all the way down (API 200, parse OK), then wrong in your own logic.**
  - `try/except` on the parse and raising `max_tokens` both **fail to help** — wrong layer / wrong failure. The only defense is a **semantic** guard: check `stop_reason` (or verify the field's presence) *before* trusting the value, and make **refusal a third outcome** — never silently pass or fail.
- **Symptom → cause routing:** *crash* → "what made the JSON unparseable?" → **truncation**. *Wrong-but-ran* → "what made valid JSON carry the wrong/missing value?" → **refusal** (or a logic bug). Match the mitigation to the *actual* failure — parse-guard for malformed JSON, `max_tokens` for truncation, `stop_reason` for refusals.

**Traps:** attributing the *crash* to refusal (refusal parses fine) or the *quiet wrong verdict* to truncation (truncation crashes); expecting a refusal to throw / be empty / be a 4xx; `try/except JSONDecodeError` "handles refusals"; fixing a refusal with `max_tokens` (or vice-versa); assuming "parses fine" ⇒ "has my fields."

*(source: [Structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) — refusals use refusal format not the schema; `max_tokens` may return incomplete output. Refusal `stop_reason`/200 semantics: [handling stop reasons](https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons).)*

---

## Extended thinking — sampling lock

> **Turn thinking ON → `temperature` must equal 1, and don't set `top_p`/`top_k`. The reasoning trace samples *freely*; clamping it is rejected, not just discouraged.**

- **`temperature` must be exactly 1** (or unset → defaults to 1). **Any** other value errors — `0`, `0.5`, `0.9` all rejected. It's a "must == 1" rule, **not** "low is bad."
- **`top_p` / `top_k` disallowed** with thinking on (leave them unset). Sampling knobs, alternatives to temperature for picking the next token:
  - **`temperature`** — sharpens (→0, focused/deterministic) or flattens (→1, varied) the *whole* distribution.
  - **`top_k`** — keep only the *k* most-likely tokens (fixed **count** cutoff), sample among them.
  - **`top_p`** (nucleus) — keep the smallest set of top tokens whose probabilities **sum to *p*** (dynamic cutoff — few when confident, many when uncertain).
  - Anthropic guidance: tune **`temperature` *or* `top_p`, not both**; `top_k` rarely needed.
- **`tool_choice` must be `auto` or `none`** with thinking — `any`/`tool` conflict (prefill vs thinking-first). See [D2 tool_choice](02-tool-design-mcp.md#tool_choice--control-whether-and-which-tool).
- **The trade-off:** need the deeper reasoning → accept `temperature: 1`; need `temperature: 0` determinism → drop thinking. **Can't have both.**
- **Aside:** even `temperature: 0` is **not fully deterministic** — it reduces variance, doesn't guarantee identical runs. "Set temp 0 for reproducibility" is a shaky premise on its own.

**Traps:** reading the error as "temperature too low" (any ≠ 1 fails, incl. 0.9); setting `top_p`/`top_k` to "tune" a thinking request; forcing `any`/`tool` tool_choice with thinking; assuming `temperature: 0` = reproducible output.

*(source: [platform.claude.com/docs/en/build-with-claude/extended-thinking](https://platform.claude.com/docs/en/build-with-claude/extended-thinking) — thinking requires temperature 1; incompatible params)*

---

## Batch processing — the one-pass, no-round-trip model *(subdomain 4.5)*

> **A batch request runs start → stop asynchronously and in isolation. The single defining constraint: it cannot pause mid-request to hand control back to your application. Everything else follows from that.**

- **Each request is processed independently** — *"each request handled independently"*; you can even mix request types in one batch. Results come back as a **single file** (poll, then download/stream the `.jsonl`); order is **not** preserved (join on `custom_id`).
- **What batch *bans* is `stream: true`**, not tools. It's one row in the unsupported-parameters table — *"Batch results come back as a single file, not a stream."* Including it returns a **validation error**. (Other banned params: `speed`/Fast mode, Threads `store`/`previous_thread_event_id`, `cache_hint`/`context_hint`, `max_tokens: 0`, research-preview mode.)
- **Tool use IS supported in batch** — including **multi-turn conversations**, extended thinking, vision, and **all server tools** (web search, web fetch, code execution, MCP connectors, advisor, tool search).

**Server vs client tools — the axis that decides batch-compatibility:**

| | **Server tool** (web search, code exec, …) | **Client tool** (your custom function) |
|---|---|---|
| Who executes it | Anthropic's infra, *inside* the request | **Your app**, *outside* the request |
| Round trip to your code? | **No** — resolves in the batch worker's own loop | **Yes** — emits `tool_use`, needs your `tool_result` |
| Batch-compatible? | **Yes** | **No** — needs a pause batch can't provide |

- **Server tools resolve automatically in-pass.** *"All server tools work in batch requests. The batch worker runs the same server-side agentic loop as the synchronous Messages API."* No streaming involved — the two are **unrelated axes**. → the web-search-in-batch scenario is **fully supported**, no streaming required.
- **Client tools need the round trip batch has no channel for.** A workflow of *Claude requests a DB tool → your app runs the query → Claude reasons over the result* requires the request to **stop and wait for your code** mid-flight. The async single-file model has no way to accept an **application-supplied** `tool_result` in-request → **not supported in a single batch request**; use a synchronous request.
- **`pause_turn` reinforces this.** Because there's **no open connection**, the batch loop runs *more* server-tool iterations per turn; if it can't finish it returns `stop_reason: "pause_turn"`, and you **continue by resubmitting the paused assistant content as a fresh request** (batch or sync). That's continuation-by-**resubmission**, *not* an in-flight pause for your tool result — batch never pauses *for you*.

**The unifying test:** *does the request complete without returning control to my application?* Server tool → yes → batch. Client tool → no → synchronous.

**Two independent axes — don't collapse them:**
- **Capability** — *can* it run in batch? Governed by the round-trip test above. Server tools: always yes. Client tools: no.
- **Latency** — *should* it, given a deadline? Batch is **async**: most batches finish in **< 1 hour**, but there's **no upper-bound guarantee** below the **24-hour expiration** ceiling (unprocessed → `expired`, dropped). So a **latency requirement can override the cost-optimal batch choice** even when batch is fully capable. Interactive / user-waiting → synchronous, full stop. "Needed within N minutes, firm" → batch is risky, lean synchronous. Only *bulk / offline / no-immediate-response* work is a clean batch fit. **Exam cue:** "bulk", "nightly", "large-scale", "offline" = latency-tolerant → batch; "live", "user waiting", "real-time", a tight deadline = latency-bound → synchronous, regardless of tool type. The 24h is an **expiration** ceiling, *not* a "results arrive at 24h" SLA.

**Traps:** *"server tools require streaming in batch"* (streaming is banned; server tools resolve automatically — unrelated axes); *"batch disallows server-tool functionality"* (it disallows **streaming**, not server tools); *"batch is limited to a single message"* (multi-turn is fine — the real limit is **no mid-request round trip**); treating `pause_turn` as a mid-request round trip (it's resubmission of a fresh request); expecting an errored request to throw (it's an `errored` result in the file, not an exception).

*(source: [platform.claude.com/docs/en/build-with-claude/batch-processing](https://platform.claude.com/docs/en/build-with-claude/batch-processing) — "each request handled independently"; unsupported-params table `stream: true` → "come back as a single file, not a stream"; "All server tools … work in batch requests. The batch worker runs the same server-side agentic loop"; `pause_turn` continuation. Server-tool list: [server-tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/server-tools).)*

---

## False-positive reduction — deterministic tolerance, not a severity dial *(subdomain 4.1)*

> **To cut false positives in a consistency/quality reviewer prompt, add a *deterministic skip rule* — "allow anything matching a pattern already present in the file" — not a probabilistic severity/confidence adjustment. Eliminate the finding; don't de-emphasize it.**

- **The rule:** if a helper's naming/style differs from the dominant convention but **matches some pattern already in that same file**, it is **not** a defect → **skip it entirely** (don't emit a finding at all).
- **Why it beats the distractors — eliminate vs de-emphasize:**
  - **Deterministic skip (correct):** a crisp, repeatable boundary → **zero** false positives on in-file-consistent code, by construction.
  - **Severity downgrade (trap):** still **emits** the finding. A low-severity false positive is *still a false positive* — noise the human must triage. "Report it more gently" ≠ "reduce false positives."
  - **Confidence threshold (trap):** **probabilistic** — it *ranks* noise, still fires above the cutoff. Reranking ≠ eliminating.
- **Connection to the [anchoring ladder](#the-anchoring-ladder):** "any pattern already in the file is acceptable" is a **declared, enumerable criterion** — the *precision* side of explicit anchoring. Explicit criteria > vague judgment.

**Traps:** "report at low severity" / "lower the confidence" offered as false-positive *reduction* (both still produce the finding — they de-emphasize, not eliminate); treating "reduce false positives" as a tuning knob rather than a **skip rule**; probabilistic confidence gate where a deterministic in-file-pattern allowance is the actual fix.

*(source: prompt-engineering precision guidance — explicit criteria reduce false positives; [prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering).)*

---

## To expand

- [ ] System prompts & role prompting; XML tag structuring
- [x] Chain-of-thought / extended thinking; when to use *(sampling lock done above — still to cover: `budget_tokens` sizing, interleaved thinking, when-to-use heuristics)*
- [x] Batch processing (4.5) — one-pass/no-round-trip, server-vs-client tools, `stream` ban, `pause_turn` *(done above)*
- [x] False-positive reduction (4.1) — deterministic in-file-pattern tolerance vs severity/confidence *(done above)*
- [ ] Prefilling responses; stop sequences
- [ ] Prompt templates & variables; model-specific prompting notes
