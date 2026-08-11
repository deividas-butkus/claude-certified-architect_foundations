# Mistakes Log

*Every missed question + the corrected reasoning. Review these first — spaced repetition of your own gaps beats re-reading what you know.*

**How to use:** log a miss the moment it happens — the scenario, what you picked, the right answer, and the *one sentence* of why you were wrong. Re-test yourself on these after a few days; delete an entry once it's automatic.

---

### 2026-07-15 — Strictness matching (`ask` vs `deny`) · Domain 1

- **Scenario:** unverified requests — masked order read (reversible) vs refund (irreversible). Best pairing of `permissionDecision`?
- **Picked:** `ask` refund / `allow` read ✗ · **Correct:** `ask` read / `deny` refund ✓
- **Why wrong:** inverted strictness. Match decision strictness to **reversibility/stakes** — irreversible + unmet precondition → `deny`, not `ask`.

### 2026-07-15 — `stop_reason: max_tokens` · Domain 5

- **Scenario:** loop branches only on `tool_use`/`end_turn`; a truncated response falls through. What's the risk?
- **Picked:** loop crashes with an unhandled exception ✗ · **Correct:** truncated response treated as complete, agent stops early ✓
- **Why wrong:** thought `stop_reason` is an error. It's **data on a 200 response** — errors throw, stop reasons route; the failure is **silent**.

### 2026-07-15 — `.claude/rules/` subdirectories · Domain 3

- **Scenario:** organizing rules into `frontend/`, `backend/`. Still discovered/loaded correctly?
- **Picked:** "only partially — subdirs ignore `paths` frontmatter" ✗ · **Correct:** yes, all `.md` discovered recursively ✓
- **Why wrong:** fell for a **fabricated mechanism**. Location never drives scope; `paths:` frontmatter does. Folder = discovery, frontmatter = scope.

### 2026-07-15 — defer vs allow (hook scope) · Domain 1

- **Scenario:** single-purpose hook sees an unrelated, harmless tool. What to return?
- **Picked:** `allow` ✗ · **Correct:** defer (no decision) ✓
- **Why wrong:** "harmless" doesn't earn `allow`. `allow` overrides the permission system; outside your lane → **defer** so other layers decide.

### 2026-07-15 — Pre vs Post (handoff) · Domain 3/5

- **Scenario:** flipping state / logging *after* a verification tool runs — which mechanism?
- **Picked:** defer ✗ · **Correct:** `PostToolUse` hook ✓
- **Why wrong:** missed "after the tool runs." `Pre` = enforcement (before); `Post` = handoff/reaction (after).

### 2026-07-15 — enum guarantee vs nudge · Domain 4

- **Scenario:** classifier must output **only** 4 labels — want a **guarantee**.
- **Picked:** prompt + examples (declare/demonstrate) ✗ · **Correct:** Structured Outputs `enum` (constrained decoding) ✓
- **Why wrong:** "guarantee" → **enforce** tier. Examples/instructions *encourage*; only constraints *guarantee*. Match the tier to the verb.

### 2026-07-15 — Edit vs Write: adjacent block swap · Domain 3

- **Scenario:** swap two *adjacent* 15-line functions (move A below B), no other changes.
- **Picked:** two Edits (delete A, re-insert A) ✗ · **Correct:** one Edit over the contiguous A+B span, rewritten swapped ✓
- **Why wrong:** "move a block" *sounds* structural, but adjacent blocks are **one contiguous span** → single Edit. Only **scattered** relocation forces full-file Write.

### 2026-07-15 — No modify tool crosses files · Domain 3

- **Scenario:** same change across N files (rename in 5 files / update duplicated block in 3).
- **Picked:** one `sed`/Edit "across all files" ✗ · **Correct:** Grep/Glob to find them, then Read + Edit **each** file ✓
- **Why wrong:** **Edit = one file, Write = one file** — no multi-file op exists. *Same change in N files = N Read+modify ops.* (Missed twice — spaced-repeat this one.)
  - Sub-point: **change a shared value** → edit the definition only; **remove a symbol** → edit every reference (else dangling calls break the build).

### 2026-07-15 — Routing vs orchestrator-workers (+ compose patterns) · Domain 1

- **Scenario:** classify into 4 fixed categories → different *predetermined* handling per category → quality check that loops back for one revision.
- **Picked:** orchestrator-workers ✗ · **Correct:** routing + evaluator-optimizer ✓
- **Why wrong:** conflated *branching* with *orchestration*. **Known** branches by a classifier → **routing**; only **model-invented, unpredictable** subtasks → orchestrator-workers ("not predictable in advance"). Also missed that real pipelines **compose** patterns — the revision loop is a second pattern (evaluator-optimizer), so single-pattern answers were incomplete.

### 2026-07-16 — Two-axis: workflow ⟂ permission (CI fix) · Domain 3

- **Scenario:** unattended CI fix for a failing test; cause could be in *any unfamiliar module*; **block writes outside `checkout/`**; no human.
- **Picked:** Plan mode + `bypassPermissions` ✗ · **Correct:** Explore-then-Execute + `dontAsk` + allow-scope `checkout/` ✓
- **Why wrong:** cross-wired two independent axes. **Permission:** a "block outside X" rule forces **fail-closed** — `bypassPermissions` is **fail-open** (approves everything → can't block), the instant disqualifier. **Workflow:** plan mode is **human-gated** (propose → wait for approval); unattended CI has no approver → fix never executes. Plan mode ≠ Explore. B ("Explore-**then**-Execute") *does* include the edit.
- **Key model:** evaluate **workflow axis** (known approach? → direct / explore→execute / plan) and **permission axis** (unlisted action? → `dontAsk` fail-closed vs `bypassPermissions` fail-open) *separately*; reject an option that fails **either**. Read scope ≠ write scope: Explore reads broadly, allow-rules gate **writes**; scope violation → fail closed → human handoff.

### 2026-07-16 — MCP reserved server name collision · Domain 2

- **Scenario:** add a custom MCP server named `computer-use` for a screenshot tool.
- **Picked:** Claude Code merges the custom tools into the built-in server under the shared name ✗ · **Correct:** rejected/skipped — `computer-use` is a **reserved built-in name**; rename it ✓
- **Why wrong:** invented a **merge mechanism** that doesn't exist. Server names are **isolated namespaces**, never merge buckets; a reserved name is *protected*, so collision → **refused, never absorbed**.
- **Exam tell:** the stem didn't say "reserved" — recognize `computer-use`/`browser`/`workspace` as **existing Anthropic built-ins**; "screenshot tool" = the computer-use hint. Don't memorize the 5-name list; recognize the concept. See [D2 MCP naming](02-tool-design-mcp.md).

### 2026-07-16 — MCP resource: `@`-mention vs auto-load config · Domain 2

- **Scenario:** reference one specific MCP server document inline in a prompt, "like a local file."
- **Picked:** add a `resources` field in `.mcp.json` that auto-loads it every session ✗ · **Correct:** `@`-mention it — `@docs:file://api/authentication` ✓
- **Why wrong:** invented a `resources:` auto-load field (fabricated mechanism) **and** wrong intent — the ask is *per-prompt, on demand*, not *always-on*. A **resource** is user-attached context you pull in with `@` (like `@file`), not a startup config. Distinguish the 3 MCP primitives: tool (model-invoked) · resource (`@`) · prompt (`/command`). See [D2 MCP primitives](02-tool-design-mcp.md).

### 2026-07-17 — MCP scope collision: override, not validation · Domain 2

- **Scenario:** repo `.mcp.json` server `analytics` + a **local**-scoped `analytics` at a different endpoint. Which is used?
- **Picked:** "duplicate name is a config error → both skipped" ✗ · **Correct:** the **local** entry (Local > Project); whole entry, **no merge** ✓
- **Why wrong:** expected **validation** (conflict → reject) where the system does **layered override** (highest scope wins, silently). A cross-scope name clash is *normal*, resolved by precedence like `$PATH`/CSS/git config. See [D2 MCP scopes](02-tool-design-mcp.md).

### 2026-07-17 — Skills precedence direction (Personal > Project) · Domain 3

- **Scenario:** `code-review` skill at bundled + personal + project; type `/code-review`. Which runs? Does plugin `myplugin:code-review` interfere?
- **Picked:** "bundled runs" / ordered it "Enterprise > Project > User > bundled" ✗ · **Correct:** **Personal** runs — `Enterprise > Personal > Project > bundled`; plugin is **namespaced**, doesn't interfere (type `/myplugin:code-review`) ✓
- **Why wrong:** **direction trap** — assumed skills follow MCP's `Local>Project>User` (narrow-wins) and treated bundled as a default winner. Skills lean **personal**: Personal **beats** Project, and bundled is the **weakest, overridable** rung. (Flipped Personal/Project 3× in one session — spaced-repeat this.) See [D3 skills precedence](03-claude-code-config.md) · [90 direction trap](90-cross-cutting-reflexes.md#resolution-model--context-vs-config-three-ladders-two-directions).

### 2026-07-19 — CLAUDE.md load order & concatenation · Domain 3

- **Scenario:** `~/.claude/CLAUDE.md` and `./CLAUDE.md` give contradicting rules. Load order? Which soft-wins? Are the loser's non-conflicting rules dropped?
- **Picked:** "project loads first, then user is read last" ✗ (flipped the order across several rounds) · **Correct:** broad → specific — **managed → user → project → local → nested**; the **closest/last** file (project) soft-wins a contradiction; **nothing is dropped** ✓
- **Why wrong:** treated CLAUDE.md like override *config* and mis-ordered it. It's concatenated **context**: all files load, **closer = read last** (soft-wins ties *only*), non-conflicting rules always survive. Mnemonic: **broad loads first, closest read last.** See [D3 instruction files](03-claude-code-config.md) · [90 resolution model](90-cross-cutting-reflexes.md#resolution-model--context-vs-config-three-ladders-two-directions).
- **Status:** closed via a 3-question mop-up (2026-07-19) — re-test in a few days, then delete.

### 2026-07-19 — Built-in skill = bundled, not Enterprise · Domain 3

- **Scenario:** you type `/security-review`; you never created it, no plugin provides it, yet it runs. Which rung of the ladder?
- **Picked:** Enterprise (top rung) ✗ · **Correct:** **bundled** — the *lowest* rung, ships built-in with Claude Code ✓
- **Why wrong:** conflated "built-in / just works" with "top / enterprise." Signature **"I never made it, no plugin, it works" = bundled** — the weakest, overridable default (`/review`, `/code-review`, `/security-review`, `/init`, `/run`). Enterprise is the *top* and for skills is undeployable anyway, so you'd never land there by accident. Distinct from the [skills-direction miss](#2026-07-17--skills-precedence-direction-personal--project--domain-3) (that was Personal-vs-Project; this is *identifying* the bottom rung). See [D3 skills precedence](03-claude-code-config.md).

### 2026-07-19 — MCP never merges — detection axis ≠ resolution axis · Domain 2

- **Scenario:** duplicate MCP servers matched **by endpoint** (plugin/connector) — do fields merge?
- **Picked:** "MCP merges fields when selected by endpoint" ✗ · **Correct:** **nothing merges — ever, at any layer** ✓
- **Why wrong:** attached "merge" to the *detection* axis. Two **independent** axes: **how a dup is detected** (by name for scopes · by endpoint for plugins/connectors) vs **what happens after** (always **whole-entry replace, zero merge**). "Matched by endpoint" ≠ "merged by endpoint." (No-merge is also stated in the 2026-07-17 scope-collision entry above — this logs the *endpoint-axis* angle specifically, still missed.) See [D2 MCP scopes](02-tool-design-mcp.md).

### 2026-07-19 — `claude mcp add` default scope = local (and local wins) · Domain 2

- **Scenario:** repo has a project `db` server; you run `claude mcp add db` with **no `--scope`**. Which scope is created; which `db` is now active?
- **Picked:** creates **global/user** scope; project `db` stays active ✗ · **Correct:** creates **local** scope; the new **local `db` wins** (Local > Project) and shadows the team's ✓
- **Why wrong:** assumed "no flag = global." The default is the **narrowest** scope (**local** = just-you-just-here), and narrowest **wins** the ladder → a flag-free add silently overrides the repo's shared server *for you*. (`--scope user` = global · `--scope project` = the shared `.mcp.json`.) See [D2 MCP scopes](02-tool-design-mcp.md).

### 2026-07-19 — `tool_choice` for conditional tool use: `auto`, not `none` · Domain 2

- **Scenario:** agent should call tools for live data/actions but answer directly from knowledge for stable facts/chit-chat. Which `tool_choice`?
- **Picked:** `{"type":"none"}` ("model can describe what it would do but never calls") ✗ · **Correct:** `{"type":"auto"}` — model decides per turn ✓
- **Why wrong:** conflated **"model decides"** with **"model can't."** `none` **forbids all tool calls** (kills the live-data half); `auto` is the **only conditional mode** (tool *or* text, per turn). `auto` and `none` are opposite ends. "Should it decide?" → only `auto` gives a decision. See [D2 tool_choice](02-tool-design-mcp.md#tool_choice--control-whether-and-which-tool).

### 2026-07-22 — `acceptEdits` scope: what auto-approves vs prompts · Domain 3

- **Scenario:** CI runs `claude -p "apply lint fixes" --permission-mode acceptEdits` but aborts partway. Which actions prompt vs auto-approve? Is it just the first tool call?
- **Picked:** "acceptEdits covers only the first tool call" / on re-test labeled **file edit + `mkdir` as *prompting*** and network/deploy as *not* ✗ · **Correct:** whole **session**; auto-approves **edits + common FS Bash** (`mkdir`,`touch`,`mv`,`cp`) → those **never prompt**; **network + other shell still prompt** ✓
- **Why wrong:** two boundaries confused — ① *time* (under-scoped to first call) and ② *tool type*. The retest miss was a **direction inversion**: read "prompt" as "covered by the mode," but a **prompt = the mode punted to the human** (fires only for *uncovered* actions). "Edits prompt under acceptEdits" is self-contradictory — that's the tell. A partway abort = a **non-edit** action (network/non-FS) needing an explicit allow rule; fix the rule, not the mode. See [D3 permission modes](03-claude-code-config.md).

### 2026-07-22 — `--output-format json` carries cost (no side log) · Domain 3

- **Scenario:** release pipeline runs `claude -p --output-format json …` and needs per-run cost. Separate log file needed?
- **Picked:** "cost data needs a separate log file / extra flag" ✗ · **Correct:** the result JSON already includes **`total_cost_usd`** + per-model breakdown + token usage ✓
- **Why wrong:** underestimated the structured output. Retention target: the field is literally **`total_cost_usd`** (cost-in-dollars) — parse it, don't build a side channel. See [D3 headless I/O](03-claude-code-config.md).

### 2026-07-22 — Piped stdin 10MB cap (fail-fast) · Domain 3

- **Scenario:** `cat build-error.txt | claude -p "explain"` errors on a large log. Cause?
- **Picked:** "shell redirection incompatibility" ✗ · **Correct:** **10MB piped-stdin cap** → immediate **error exit, non-zero**, **zero** processed ✓
- **Why wrong:** misattributed a size limit to shell mechanics. Oversized input **hard-errors, never truncates/degrades**. See [D3 headless I/O](03-claude-code-config.md).

### 2026-07-22 — Path-rule glob depth + YAML list · Domain 3

- **Scenario:** load Terraform conventions only under `terraform/`. `paths` value?
- **Picked:** bare string + single-`*` (`terraform/*.tf`) ✗ · **Correct:** **list** form, **`**`** for any depth: `paths: ["terraform/**/*.tf"]` ✓
- **Why wrong:** treated it as informal shell globbing. `paths` is **always a list** (even for one pattern); **`*` = one segment (direct children), `**` = any depth**. (Same glob semantics as the [`.claude/rules/` scope note](03-claude-code-config.md).)

### 2026-07-24 — `allowed-tools` = grant (don't-ask), NOT a restriction · Domain 3

- **Scenario:** limit a `report-generator` skill to file writes so it *can't* run shell / delete files. Which SKILL.md field?
- **Picked / keyed:** `allowed-tools: Write Edit` — thinking it *restricts* the skill to those tools ✗ (the exam keyed this, but the *rationale* is wrong) · **Correct concept:** `allowed-tools` only **suppresses the prompt** for listed tools — *"every tool remains callable"*; the field that actually **removes** a tool is **`disallowed-tools`** ✓
- **Why wrong:** conflated *pre-approval* with *restriction*. Two different axes: `allowed-tools` = **prompting** (don't ask; tool still available), `disallowed-tools` = **availability** (removed from pool). Both **turn-scoped** (clear on next message); durable versions are settings **allow**/**deny** rules. "Named opposites but different axes" — don't read them as symmetric. See [D3 SKILL.md frontmatter](03-claude-code-config.md).

### 2026-07-24 — model/effort vs `context: fork` (execution-tuning sub-split) · Domain 3

- **Scenario:** skill should run with higher effort + a specific model, **only while active, revert after**. Which frontmatter?
- **Picked:** `context: fork` + `agent` ✗ · **Correct:** **`model` + `effort`** ✓
- **Why wrong:** grabbed the *isolation* cluster for a *model-tuning* need. Both are "execution tuning" but split by weight: **`model`/`effort`** = lightweight in-turn override, auto-reverts next prompt; **`context: fork`/`agent`/`background`** = heavyweight isolated subagent (no conversation history). Decider: *"only while active / revert this turn"* → model+effort; *"isolated / no history / runs separately"* → fork. See [D3 SKILL.md frontmatter](03-claude-code-config.md).

### 2026-07-24 — "read-only" = a fixed allowlist, not "anything that only reads" · Domain 3

- **Scenario:** in plan mode reads run without prompting; why does a harmless-looking shell command still prompt / when do reads flow silently?
- **Picked (implied):** any command that only reads is prompt-free across modes ✗ · **Correct:** silence covers ① built-in **read tools** (`Read`/`Grep`/`Glob`) and ② shell commands **on the built-in read-only allowlist**; anything off the list **prompts** (Manual/plan) or routes to the classifier (auto) ✓
- **Why wrong:** treated "read-only" as a semantic judgment rather than a **defined allowlist**. `touch`/`rm` prompt because they're **not on the list** — and still prompt even under **plan + auto** (plan's edit-block + non-read-only both hold). Composition: **plan blocks writes; auto's classifier frees read-only actions** (`useAutoModeDuringPlan`, default on when auto available). Remove auto → plan reverts to Manual (only allowlisted reads silent). See [D3 plan × auto](03-claude-code-config.md).

### 2026-07-24 — Refusal vs truncation: opposite failures, routed backwards · Domain 4

- **Scenario:** CI gate pipes `claude -p … --output-format json --json-schema '…'` to `jq -e '.passed'`. Sometimes `jq` **crashes** (unparseable input); other times the build is **wrongly marked failed** on a clean diff. Route each symptom to its cause.
- **Picked:** crash → *refusal*; wrong-verdict → *truncation* ✗ · **Correct:** crash → **truncation** (`stop_reason: max_tokens`, JSON cut off mid-object → unparseable); wrong-verdict → **refusal** (`stop_reason: refusal`, **HTTP 200**, valid JSON with your fields **missing**) ✓
- **Why wrong:** inverted which failure is loud vs quiet. **Truncation = loud/crash** (invalid JSON); **refusal = quiet/wrong** (valid JSON, absent fields). A refusal is a *successful* response, not an error — it slips past `try/except JSONDecodeError` and every plumbing check, biting only when code **reads** the missing field. `max_tokens` fixes truncation; a `stop_reason` guard fixes refusal — matching the *other* mitigation does nothing. (Adjacent to the [2026-07-15 `max_tokens`](#2026-07-15--stop_reason-max_tokens--domain-5) entry — same "stop_reason is data on a 200, not an exception" root, now with the refusal twin.) See [D4 two failure modes](04-prompt-engineering-structured-output.md#structured-outputs-fail-two-ways-ci-parsing-lens).

### 2026-07-24 — Three doors: `--json-schema` (reply) vs `strict` (tool args) vs `--output-format` (envelope) · Domain 4

- **Scenario:** guarantee the **arguments** Claude passes when it *calls a tool* match a fixed schema. Which mechanism?
- **Picked:** `--json-schema` constraining the reply ✗ · **Correct:** **`strict: true`** on the tool definition ✓
- **Why wrong:** conflated two output channels. `--json-schema`/`output_config.format` shape **the reply Claude sends back**; `strict: true` shapes **the arguments Claude passes into a tool** — different targets, same grammar engine. Missed the same seam twice in one session. **Keyword detector:** *tool/arguments* → `strict`; *reply/answer* → `--json-schema`; *print-JSON-not-prose (CLI wrapper)* → `--output-format json` (the **envelope**, which *stacks* with `--json-schema`, never competes). See [D4 three doors](04-prompt-engineering-structured-output.md#three-doors--which-output-am-i-shaping).

### 2026-07-24 — `--json-schema` v2.1.205: `format` direction reversed · Domain 4

- **Scenario:** got the mock right (invalid schema on v2.1.205 → **fail fast at startup**, no output — the correct, current behavior). Then *volunteered* "post-2.1.205, `format` fields are not allowed."
- **Stated:** `format` **not allowed** post-2.1.205 ✗ · **Correct:** post-2.1.205 `format` is **accepted as a non-enforced annotation** (run proceeds); **≤ 2.1.204** was the reject regime ✓
- **Why wrong:** inverted the *direction* of the change and picked the wrong version as "current." 2.1.205 moved **two** knobs in **opposite** directions: **stricter** on malformed schemas (silently-ignored → fail-fast abort), **more lenient** on `format` (rejected → accepted-but-unenforced). Also collapsed **"not enforced" into "not allowed"** — `format` permitted ≠ `format` validated. Mnemonic: **stricter on structure, softer on `format`.** Adjacent draft-version trap: SDK is **draft-07 only** → a `2020-12` `$schema` is startup-*invalid* (Zod needs `target: "draft-7"`). Keep the two validation moments apart: **schema invalid** → startup abort, no output, never hits retries; **output can't conform** → post-run `error_max_structured_output_retries`. See [D4 v2.1.205 cutover](04-prompt-engineering-structured-output.md#--json-schema-validation--the-v21205-cutover).

### 2026-07-25 — No-`paths` rule = eager launch load, not an implicit `**/*` wildcard · Domain 3

- **Scenario:** `.claude/rules/general-style.md` (no `paths` frontmatter) alongside `api.md` with `paths: ["src/api/**/*.ts"]`. How is `general-style.md` treated vs `api.md`?
- **Picked:** general-style loads lazily via a default `**/*` glob, functioning identically to `api.md` but broader ✗ · **Correct:** general-style loads **at launch, unconditionally, same priority (tier) as `.claude/CLAUDE.md`**; `api.md` loads **only when Claude reads a matching file** ✓
- **Why wrong:** treated a **missing config field as an implicit wildcard default** rather than a **mode switch**. Presence/absence of `paths` flips the *loading tier*: **no `paths` = eager (launch, always in context); `paths` = lazy (fires on matching Read, not every tool use)**. Even a literal `**/*` glob would still be *lazy* — so it could never be "identical to CLAUDE.md." Docs verbatim: *"Rules without `paths` frontmatter are loaded at launch with the same priority as `.claude/CLAUDE.md`."* Same eager-vs-lazy dichotomy governs CLAUDE.md itself: **ancestor CLAUDE.md = eager; subtree CLAUDE.md = lazy (loads when Claude reads a file in that subdir).** Nuance on "same priority": means same **tier** (eager), *not* same **slot** in concat order — docs pin *user rules before project rules* and *root→cwd, closer read last*, but don't document the exact interleave of `.claude/CLAUDE.md` vs project `.claude/rules/*.md`. **Detector:** field *present* → ask "which files trigger it?"; field *absent* → "always on, like CLAUDE.md." Missing field ≠ wildcard. Sibling of the [2026-07-15 subdir entry](#2026-07-15--clauderules-subdirectories--domain-3) (*folder = discovery, frontmatter = scope*) — this adds *frontmatter presence = eager-vs-lazy timing*. Source: [Claude Code memory docs](https://code.claude.com/docs/en/memory). See [D3 rules](03-claude-code-config.md).

### 2026-07-25 — `tool_choice` `auto`-vs-`none` — REPEAT miss · Domain 2

- **Scenario:** support agent calls live-data tools when fresh info is needed, answers stable FAQs directly in text with no tool call. Which `tool_choice`?
- **Picked:** `{"type":"none"}` ✗ · **Correct:** `{"type":"auto"}` ✓
- **Why wrong:** **same inversion as the [2026-07-19 entry](#2026-07-19--tool_choice-for-conditional-tool-use-auto-not-none--domain-2)** — read `none` as "the model *may choose not to* call" when it means "the model is *forbidden from* calling **any** tool." `none` kills the live-data half outright. "Model should **decide** whether to use a tool" → **`auto`** is the only conditional mode (tool *or* text per turn); `auto`/`none` are opposite ends (*may* vs *may not*).
- **Repeat flag:** missed this exact discrimination twice (2026-07-19, 2026-07-25) — **spaced-repeat hard.** Reflex to burn in: see "let the model decide" → reach for `auto` on sight; treat `none` as the distractor that *forbids*, never the one that *defers*. Note the rest of the forcing space (`any` vs `tool`, structural-vs-behavioral guarantee, prefill-suppresses-text, extended-thinking incompat) was solid this session — the gap is narrowly `none`'s meaning. See [D2 tool_choice](02-tool-design-mcp.md#tool_choice--control-whether-and-which-tool).

### (migrated from auto-memory) — acceptEdits: "prompt" = the mode punted to the human · Domain 3

- **Scenario (recurring slip):** twice inverted the meaning of a permission "prompt" — labeled acceptEdits-*covered* actions (file edits, `mkdir`/`touch`/`mv`/`cp`) as "prompts" and *gated* actions (network fetch, custom shell scripts) as "doesn't prompt."
- **Why wrong:** read "prompt" as "is covered/handled by the mode" — it's the **opposite**. A prompt is what happens when the mode does **not** cover an action and must **ask the human**; auto-approved actions **never** prompt. The concept was solid (acceptEdits *does* cover filesystem edits); the miss was mapping "covered" onto the wrong column.
- **Anchor:** *"prompt = the mode punted to the human."* Tell for the inversion: "edits prompt under acceptEdits" is self-contradictory — the mode exists to *remove* edit prompts. Watch the same "covered vs gated" confusion on other permission-mode questions.

### (migrated from auto-memory) — Config resolution: three axes (scope / sharing / persistence) · Domain 3

- **Scenario (recurring pattern):** config questions (CLAUDE.md hierarchy, v1.0 action migration, flags-vs-files). Misses were never "what is this file" — every miss mapped a requirement onto the **wrong axis**.
- **Resolve THREE independent axes before answering:**
  1. **Scope** — one repo or all? (`./CLAUDE.md`/`CLAUDE.local.md` = this repo; `~/.claude/CLAUDE.md` = all repos)
  2. **Sharing** — committed & team-shared, or git-ignored & personal? (`./CLAUDE.md` committed; `CLAUDE.local.md` git-ignored; `.claude/rules/` **is** git-tracked)
  3. **Persistence** — durable file (`CLAUDE.md`) or ephemeral runtime flag (`--append-system-prompt`)?
- **How to apply:** a wrong option usually fails exactly **one** axis (right idea, wrong scope/sharing/persistence) — name which. Traps seen: runtime flag chosen when requirement said "consistent/CI/team" (needs committed file); `~/.claude` chosen for "this repo only"; overlooked `.claude/rules/` is git-tracked. `.local` (narrow) vs `~/.claude` (broad) both *feel* "personal" and get swapped — same direction-slip as the acceptEdits entry above.
- **v1.0 `claude-code-action` migration — THREE buckets, not two** (don't dump everything in `claude_args`): **Dropped/auto-detected:** `mode`. **Renamed but stays a top-level named input:** `direct_prompt`→`prompt`; `anthropic_api_key` unchanged. **Moved into `claude_args` as CLI flags:** `custom_instructions`→`--append-system-prompt`; `max_turns`→`--max-turns` (CLI flag is **hyphen**; beta input was underscore). Faithful migration → flag; don't overcorrect to "always prefer the file," and don't over-migrate named inputs *into* `claude_args`.

### 2026-07-26 — Batch + server tools: bans streaming, NOT tools · Domain 4

- **Scenario:** batched research requests each use a **server-side web search** tool. What's required / is it supported?
- **Picked:** server tools **require streaming** in batch ✗ · **Correct:** fully supported, **no streaming** — *"All server tools work in batch requests; the batch worker runs the same server-side agentic loop as the synchronous Messages API"* ✓
- **Why wrong:** conflated two unrelated axes. Batch's tool-relevant ban is **`stream: true`** (*"results come back as a single file, not a stream"* → validation error), **not** server-tool functionality. Server tools **resolve automatically in-pass** in the batch worker's own loop — streaming never enters into it. Retention anchor: **batch bans streaming, not server tools.** See [D4 batch processing](04-prompt-engineering-structured-output.md#batch-processing--the-one-pass-no-round-trip-model-subdomain-45).

### 2026-07-26 — Batch limit is "no round trip," NOT "single message" · Domain 4

- **Scenario:** workflow needs Claude to request a **database-lookup (client) tool**, receive **your app's** result, then reason over it — inside a batch request.
- **Picked:** batch **limits to a single message** ✗ · **Correct:** the real blocker is **no mid-request round trip** — batch cannot pause to accept an **application-supplied** `tool_result`; each request runs start→stop independently ✓
- **Why wrong:** wrong framing of the limit. Batch **does** support multi-turn conversations and tool use — so "single message" is a fabricated ceiling. The actual constraint: a batch request **can't stop and hand control back to your code** mid-flight (no open connection). Server tools work (Anthropic resolves them internally); **client tools don't** (need *your* round trip) → use a synchronous request. **`pause_turn` is continuation-by-resubmission (a fresh request), not an in-flight pause for your result** — don't mistake it for a round trip. **Unifying test:** *completes without returning control to my app?* server=yes→batch, client=no→sync. Twin of the entry above (same one-pass model, tool-execution side). See [D4 batch processing](04-prompt-engineering-structured-output.md#batch-processing--the-one-pass-no-round-trip-model-subdomain-45).

### 2026-07-26 — False positives: deterministic skip, NOT a severity downgrade · Domain 4

- **Scenario:** reviewer prompt flags a helper whose naming differs from the file's dominant convention, even though it matches an existing in-file pattern. Best way to cut this false positive?
- **Picked:** report it at **low severity** ✗ · **Correct:** **skip** anything matching a pattern **already present in the file** — a deterministic tolerance rule ✓
- **Why wrong:** confused **de-emphasize** with **eliminate**. A low-severity false positive is *still a false positive* (still emitted, still triaged). "Reduce false positives" = **don't produce the finding**, which a deterministic "allow any existing in-file pattern" rule does by construction — vs severity-downgrade / confidence-threshold distractors, which only *rerank* noise (probabilistic, still fire). This is the **precision side of the [anchoring ladder](04-prompt-engineering-structured-output.md#the-anchoring-ladder)**: explicit *declared* criteria > vague judgment. See [D4 false-positive reduction](04-prompt-engineering-structured-output.md#false-positive-reduction--deterministic-tolerance-not-a-severity-dial-subdomain-41).

### 2026-08-10 — The two `.local` twins diverge on git-exclude AND worktree · Domain 3

- **Scenario (drill):** `settings.local.json` vs `CLAUDE.local.md` — which self-excludes from git? which is shared across worktrees?
- **Correct:** they behave **oppositely** on *both* axes. **Git-ignore:** `settings.local.json` **auto-adds** itself to *global* excludes on a settings-subsystem write; `CLAUDE.local.md` is **manual** (docs: "add it to `.gitignore`"). **Worktree:** `settings.local.json` is read from the **repo root** (resolved through worktrees) → one file covers all; `CLAUDE.local.md` **exists only in the worktree where you made it** → per-checkout (use `@~/.claude/…` import to share).
- **Mental model:** *settings = repo-wide + self-hiding; memory = checkout-local + hide-it-yourself.* Don't assume the two `.local` files share behavior because they share a suffix — same `.md`=memory / `.json`=config seam as the config-home question. Also: memory discovery matches **only the two exact names** `CLAUDE.md`/`CLAUDE.local.md` (not a `CLAUDE.*` prefix); any other name needs `@import`. See [D3 settings.local.json cell](03-claude-code-config.md).

### 2026-08-10 — PROCESS: don't assert version/deprecation status from a search snippet · meta

- **Scenario:** claimed `CLAUDE.local.md` was **deprecated** across several drill turns; a doc fetch showed it's **current & supported** (listed as a live scope, docs even say to *create* one). Propagated the false fact into the repo doc before catching it.
- **Why wrong:** stated a **version-gated/status fact from a web-search *summary* + a GitHub issue *title*** ("Is X deprecated?"), not the live doc — the issue title *asks*, it doesn't *confirm*. Exactly the failure my own [instruction-observability note](03-claude-code-config.md) warns about ("listed ≠ loaded"; verify current behavior before recommending).
- **How to apply:** for any *deprecated / removed / added-in-vX / default-changed* claim → **fetch the primary doc first**, don't answer from memory or snippets. A snippet is a lead, not a citation. Same reflex as the [90 direction/version traps](90-cross-cutting-reflexes.md) — a stated status is a *live variable to verify*, not a recalled constant.

### 2026-08-11 — Identity proofing (Persona) vs account authentication · trust & safety

- **Scenario:** consumer (Claude Pro) disputes a charge; can't give account number/phone; multiple similar accounts. Per official docs, how does support verify identity?
- **Picked:** "ask for the account number or the **PIN on file**" ✗ · **Correct:** identity verification via **Persona** — government-issued photo ID + live selfie ✓
- **Why wrong:** reached for an *authentication factor* (something you know) when the stem had already **ruled it out** (no account #, ambiguous accounts) — and **Anthropic accounts have no "PIN on file"** (bank/telco reflex, a **fabricated mechanism**). When credentials are unavailable *and* accounts collide, you can't authenticate → escalate to **identity proofing**. Anthropic's documented ID-proofing partner is **Persona** (ID + selfie).
- **Caveat on the mock:** the real [Persona doc](https://support.claude.com/en/articles/14328960-identity-verification-on-claude) scopes ID-proofing to *abuse prevention / usage-policy enforcement / legal compliance* and **account-flag appeals** — **not** billing disputes. The question staples a billing story onto the ID-proofing doc; A still wins only because it's the sole answer naming a real Anthropic mechanism. **Read the trigger, then match the mechanism:** flag/appeal ⇒ Persona; billing/credentials ⇒ authentication (no documented Persona path).
- **Concept:** *identity proofing (prove the person)* ≠ *authentication (prove credential control)*. Mnemonic: **"Know it" fails → "Prove it" (Persona = ID + selfie).** See [90 authenticate≠authorize cluster](90-cross-cutting-reflexes.md#core-reflexes-one-liners).

### 2026-08-11 — SDK resume vs fork after `error_max_turns` · Domain 3

- **Scenario:** session hit `error_max_turns` mid-investigation; want to **keep the analysis and keep working** with a higher ceiling, no repeat.
- **Picked:** **fork** the session, higher `max_turns` on the new branch ✗ · **Correct:** **resume** the session ID with a higher `max_turns` on the follow-up `query()` ✓
- **Why wrong:** treated **fork** as the "give it more room to keep going" tool — but fork is for **divergence** (a *copy* that branches, original preserved for a go-back/compare). The ask was to continue the **one** thread → resume, the doc's **named recovery path** for `error_max_turns`. Also a false premise: `max_turns` is a **per-`query()` option settable on any call**, not a fork-only capability, so "fork to set higher max_turns" solves nothing resume doesn't. Mnemonic: **resume = same road, refill the tank; fork = new road, keep the old map.** Decider — *keep going on one investigation* → resume; *two threads to compare / don't alter original* → fork. See [D3 resume vs fork](03-claude-code-config.md#session-resume-vs-continue-vs-memory).

### 2026-08-11 — Batch window sizing vs arrival-anchored SLA: zero-margin trap · Domain 4/5

- **Scenario:** docs arrive continuously; use Message Batches (50% off, ≤24 h) but SLA = results within **30 h of arrival** at **99.9%**. Submit batches every 6 h / 4 h / …?
- **Picked:** every **6 h** (6 + 24 = 30 h) ✗ · **Correct:** every **4 h** (4 + 24 = 28 h) ✓
- **Why wrong:** sized the window to land *exactly* on the deadline. Deadline is measured from **arrival**, so the binding case is the **oldest doc** in a window — it's already aged `W` before submission → worst case = **`W` + 24 h (expiration ceiling) + retry margin**. The 24 h is a **ceiling, not a target**: batches can **`expire`** and need **resubmission** (docs: *"Batches expire if processing does not complete within 24 hours"*; under load *"more requests expiring after 24 hours"*). 6 h fits arithmetically but with **zero slack** → one slowdown/expiry breaches the **99.9%**; 4 h leaves a 2 h buffer for a resubmit. **Reliability SLA ⇒ don't size to the ceiling; leave a retry margin.** See [D4 batch window sizing](04-prompt-engineering-structured-output.md#batch-processing--the-one-pass-no-round-trip-model-subdomain-45).

---

*Pattern across misses:* mostly the **"what's my authority / which layer / which tier"** axis, and **distractors that fabricate a plausible mechanism**. Risk-reasoning itself is solid. *File-tool misses add a new axis:* **re-classify the change's shape/scope every time** — contiguous vs scattered, one file vs N — instead of reusing the prior answer or assuming a single op spans files. *Workflow-pattern misses add another:* **match each scenario feature to a pattern trigger** (branch-on-known → routing; unpredictable subtasks → orchestrator; refine-loop → evaluator-optimizer), and **compose** when a scenario has more than one feature. *Config-resolution misses add another:* **context is concatenated (nothing dropped), config selects exactly one** — and skills vs MCP resolve in **opposite directions** (Personal > Project vs Local > Project > User); don't assume one rule.
