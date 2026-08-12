# Domain 1 — Agentic Architecture & Orchestration

Multi-step workflows, enforcement, handoff, human-in-the-loop.

---

## Workflow patterns — the trigger for each

> **Workflow = predefined code paths. Agent = model chooses next step from feedback.** Fixed/knowable path → workflow; can't predict the steps → agent. *Start simple; add agency only when simpler falls short.*

| Pattern | One-line trigger | Disqualifier |
|---|---|---|
| **Prompt chaining** | Fixed, cleanly decomposable *sequential* steps (+ optional programmatic **gate** between them) | Order/branch changes at runtime |
| **Routing** | Classify input → dispatch to a **predetermined** specialized handler | Handlers aren't known in advance |
| **Parallelization** | Independent subtasks run concurrently — *sectioning* (split) or *voting* (same task, aggregate) | Steps depend on each other's output |
| **Orchestrator-workers** | A model **dynamically decides** subtasks it **can't predict in advance**, delegates, synthesizes | The breakdown is hardcodable |
| **Evaluator-optimizer** | Output is **judged and looped back** for revision against criteria | One pass is enough / check is pass-fail only |

- **Gate ≠ router ≠ evaluator.** Gate = pass/fail *proceed-or-halt* (programmatic); router = *route-to-one-of-N* (classifier); evaluator = *judge + revise loop* (LLM).
- **Branching ≠ orchestration.** *Known* branches by a classifier → **routing**; *model-invented* subtasks → orchestrator-workers. Hunt for "**predictable in advance**."
- **Real pipelines compose patterns** — a scenario with a classification branch *and* a refine loop → **routing + evaluator-optimizer**. Single-pattern answers to multi-feature scenarios are usually incomplete distractors.
- **Parallelization can live *inside* a chain** (e.g. fan-out translations) without changing the top-level "chaining" answer — it's a stage optimization, not the overall strategy.

*(source: [anthropic.com/engineering/building-effective-agents](https://www.anthropic.com/engineering/building-effective-agents))*

---

## Permission decisions: `allow` / `ask` / `deny` / `defer`

These four are the `PreToolUse` **hook** `permissionDecision` values ([hooks doc](https://code.claude.com/docs/en/agent-sdk/hooks)). Precedence when several apply: **`deny` > `defer` > `ask` > `allow`.**

| Decision | Use when | Watch-out |
|----------|----------|-----------|
| `allow` | Provably safe **and** in your hook's scope; you intend to guarantee it runs | It **overrides** the permission system — never use it outside your hook's lane |
| `ask` | A **disclosure** or a **reversible** change that deserves a human check | Resolves to a human on *your* side (user or operator) — **never** the provider |
| `deny` | **Irreversible / high-stakes** with an unmet precondition | Stops the **action, not the agent** — reason flows back to the model, which adapts |
| `defer` | Approval may take **longer than the process can stay running** | **Ends the query** so the process can exit; resume later from the **persisted session**. `updatedInput` is **dropped**. About *time*, not *who decides* |

- **`ask` ≠ `deny`.** `ask` can still run (if approved); `deny` never runs.
- **`ask` ≠ `defer`.** `ask` keeps the query **paused in-process** waiting on `canUseTool`; `defer` **tears the process down** and reconstitutes the decision on session resume. Same "not-decided-yet" feel, opposite process lifecycle.
- **`defer` is a hook decision, not a `canUseTool` return** — the callback returns only `allow`/`deny` (see below). Don't confuse "the call routed *to* `ask`" with a `defer`.
- **`ask`-the-user** answers *"is it really you?"* (establishes a precondition — good for reads).
- **`deny`** an irreversible action while a precondition is unmet, run verification as its **own** flow, then re-decide on a fresh attempt.
- **"Please identify" is a `deny`-shaped task** (establish a precondition), not an `ask` (which only collects a yes/no on the pending call).
- **`deny` stops the action, not the conversation** — the reason returns to the model, which adapts (explains, reroutes, requests the precondition).
- **Who resumes a `defer`:** nobody in the SDK — it just persists the session. **Your host app** calls `query({ resume: <session_id> })` when *your* external trigger fires (approval webhook, user click, queue/cron). No built-in scheduler/poller.

**Worked example — agent handling a customer refund:**

| Tool call | Decision | Why |
|-----------|----------|-----|
| `Read` order history | `allow` | Read-only, safe, in-scope — just run it |
| `Bash(rm -rf …)` / write outside workspace | `deny` | Irreversible, precondition can never be met — block, reason to model |
| Email refund confirmation to customer | `ask` | Reversible-ish, human is **on-shift** → resolves in seconds via `canUseTool` |
| Issue $5,000 refund needing manager sign-off | `defer` | Approver is in a **separate system, maybe tomorrow** → kill process, resume on webhook |

> `ask` vs `defer` turns purely on **approval latency**: seconds-and-someone's-there → `ask`; slow/async/offline → `defer`.

---

## Escalation & handoff

- **Four escalation triggers:** (a) explicit user request, (b) irreversible/high-stakes action, (c) low confidence / repeated failure, (d) policy/compliance. *Distractors are usually the right action for a **different** trigger.*
- **Explicit "get me a human" is honored promptly** — overrides the *"try to resolve first"* efficiency default, but **NOT** an irreversibility/compliance guardrail.
- **Verification gates ACTIONS, not AUDIENCES.** Talking to a human isn't a sensitive action → escalate immediately, let the operator verify. *Authenticate ≠ authorize.*
- **Preference vs guardrail collision → the guardrail wins**, and **hold + explain** (a block is not a stonewall). Never *reshape/downsize* an action to dodge a control (**guardrail evasion**).
- **Escalate with the context you already have**; only gather first if you're missing what the human needs (the "tens of minutes → info already gathered" tell).

### Handoff payload (structured, minimize PII)

trigger (why now) · verified-state · intent + stated prefs · conversation context · **work already done** · the **exact pending action** + args · risk/confidence · recommendation.

> Highest-value fields for exam questions: **the trigger** and **the precise gated action + its risk**. Incomplete-handoff distractors drop one of those.

---

## Hooks vs prompts (the enforcement principle)

> **A prompt is a *request* the model may honor. A hook is *code* the harness will run.**

- **Enforce with hooks / `canUseTool`** (deterministic, unskippable) · **guide with prompts** (probabilistic).
- Anything you cannot leave to probability → a hook.
- "Deterministic" = guaranteed *invocation + effect*; the logic inside can be arbitrarily smart (even call an LLM).
- SDK: `{ behavior: "allow", updatedInput }` or `{ behavior: "deny", message }`. Interactive `ask` = the layer above, routed to your human.

---

## Origin → enforcement layer

| Malformed / risky value comes from… | Enforce at… |
|---|---|
| **Model's own output** (generation) | **Structured Outputs / `enum`** (prevent) · or app-level **validate + retry** (correct). *No tool ran → no `PostToolUse`.* |
| **A tool / external MCP source** | **`PostToolUse` hook** normalizes/validates the result before it enters context |

- `PreToolUse` gates **inputs**; `PostToolUse` reacts to **outputs**.
- Deterministic reformatting is safe only when the format is **unambiguous or contractually known** (usually true for external systems, usually not for a model's free-form output).

*See also:* [reliability & error taxonomy](05-context-management-reliability.md), [Structured Outputs API](04-prompt-engineering-structured-output.md).
