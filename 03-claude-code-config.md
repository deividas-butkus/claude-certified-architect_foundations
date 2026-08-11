# Domain 3 — Claude Code Configuration & Workflows

*`.claude/` directory, rules, hooks config, settings, commands, subagents, skills.*

---

## Confirmed so far

### `.claude/rules/` — discovery ⟂ scope

> **Folder = discovery (for humans). `paths:` frontmatter = scope (for Claude). They never cross.**

- All `.md` under `.claude/rules/` are discovered **recursively** — subdirectories are organizational only, and do **not** affect loading.
- Scope comes from the **`paths:` frontmatter**, not the file's location:
  - **no `paths`** → loads globally (like CLAUDE.md),
  - **with `paths: [glob]`** → loads only when Claude works on matching files.
- Moving a rule file changes **where you find it**, never **how Claude scopes it**.
- `paths:` matches the **files Claude edits**, never the rule file's own path.
- Rules load at the **same priority as CLAUDE.md**. Check what's **actually loaded** with **`/context`** (Memory files list) — **not `/memory`**, which only lists *configured* locations. See *Instruction observability* below.
- Known bugs (not designed behavior): `paths:` sometimes ignored in `~/.claude/rules/` and via git-worktree resolution.

**Trap:** "subdirectories load unconditionally / ignore `paths`" — **fabricated mechanism.** Location never drives scope.

---

### File modification tools — Edit vs Write

> **Tool follows the *shape* of the change, not the size of the file.**

- **New file** → `Write` (no Read needed). **Overwrite existing** → `Read` first — hard gate; a `Write`/`Edit` to an unread existing file **fails with an error**. A `PARTIAL view` (truncated read) does **not** satisfy it.
- **Contiguous span** (incl. *adjacent* blocks reordered) → one `Edit` (`old_string`→`new_string`, exact match + unique).
- **Scattered reshaping** (relocate/consolidate non-adjacent lines) → full-file `Write` after Read.
- **Identical, self-unique token** → one `Edit` + `replace_all: true`. **Token that collides as a substring** (`id` in `width`, `tmp` in `tmpl`) → **context-anchored Edits**; `replace_all` here corrupts.
- **No modify tool crosses files.** Edit = one file, Write = one file. *Same change in N files* = N Read+modify ops (Grep/Glob to find them).
- **Change a shared value** → edit the definition only (importers follow). **Remove a symbol** → edit *every* reference (dangling calls break the build).

**Traps:** reusing the prior question's tool without re-classifying the change; picking `Write` for a small file when only a substring changes; a single `Edit`/`sed`/`replace_all` "across all files" (no such capability).

*(source: [code.claude.com/docs/en/tools-reference](https://code.claude.com/docs/en/tools-reference) — Edit & Write tool behavior)*

---

### Permission modes — fail-closed vs fail-open

> **The unattended-CI axis: `dontAsk` = fail-*closed* (deny), `bypassPermissions` = fail-*open* (approve). Both never prompt — pick by what should happen to *unlisted* actions.**

| Mode | Behavior | Prompts? |
|---|---|---|
| `default` | Auto-approve reads; **prompt** before other actions | Yes |
| `acceptEdits` | Auto-approve file Read/Edit/Write **+ common FS Bash** (`mkdir`,`touch`,`mv`,`cp`); network + other Bash still prompt | Partly |
| `plan` | Read/explore only, propose a plan, **no edits** | — (planning) |
| `dontAsk` | **Any prompt → denial.** Pre-approved (allow rules / `--allowedTools` / built-in read-only set) still run | **No** (denies) |
| `bypassPermissions` | **Approves everything** that reaches it | **No** (allows) |

- **Locked-down unattended runner** → `dontAsk` **+ `permissions.allow` / `--allowedTools`** for the whitelist. Mode alone leaves only the built-in read-only commands; add allow rules to permit your approved set.
- **Why not the others for CI:** `default`+timeout → the prompt still **hangs** (no human); `acceptEdits` → auto-approves **writes** (breaks read-only) and Bash still prompts; `--max-turns N` limits *count*, not *which* commands; `bypassPermissions`/`--dangerously-skip-permissions` → fail-**open** (the opposite of locked-down).
- **`dontAsk` denies the *action*, not the *process*.** A denial returns to the model (it adapts/finishes) — it's not a hard `exit`. For hard-fail-on-violation, layer a **`PreToolUse` hook** that logs + exits.
- **`deny` rule ≠ `dontAsk`.** `deny` rules = blacklist specific items (deny always wins); `dontAsk` = whitelist posture (deny everything *not* allowed).
- **Headless plumbing (adjacent):** `-p/--print` = non-interactive; `--bare` = clean-room reproducible (skips ALL ambient config — see *Headless reproducibility* below). **auto mode** = sandbox-backed safer skip (middle ground vs blanket bypass).

**Traps:** `bypassPermissions` for "no prompts in CI" (ignores the read-only/locked-down requirement — fail-open); `acceptEdits` as "the automation mode" (writes auto-approve but network + non-FS Bash still prompt → a run doing web calls/deploys still stalls); expecting `dontAsk` to hard-kill the process on a violation.

**`acceptEdits` scope — two boundaries (the Q19 trap):** ① *time* — covers the **whole session**, not just the first tool call; ② *tool type* — covers **file edits + common FS Bash only**; **network requests + other shell commands still prompt** (need `--allowedTools` / `permissions.allow`). **Anchor: a "prompt" = the mode punted to the human** → it fires *only* for actions the mode does **not** cover. So auto-approved edits **never** prompt; "edits prompt under acceptEdits" is self-contradictory (that inversion is the tell). A CI run that "aborts partway" under `acceptEdits` hit a **non-edit** action (network / non-FS command) needing an explicit allow rule — fix the rule, not the mode.

*(source: [code.claude.com/docs/en/permission-modes](https://code.claude.com/docs/en/permission-modes) · [headless](https://code.claude.com/docs/en/headless))*

---

### Symlinks & permission rules — two paths checked, allow/deny asymmetric

> **When Claude accesses a symlink, permission rules check *both* the link path *and* its resolved target. Allow needs *both* to match; deny fires if *either* matches.** (This is the **permission** subsystem — unrelated to path-scoped *rule* matching through a symlinked checkout, [above](#version-gated-path-rule-behaviors).)

- **Allow rule** = AND — applies only when **both** the symlink path and its target match. A symlink inside an allowed dir pointing **outside** it still **prompts** (target fails the allow).
- **Deny rule** = OR — applies when **either** the symlink path **or** its target matches. A link pointing to a denied file is itself denied.
- Docs' canonical example: `Read(./project/**)` allowed + `Read(~/.ssh/**)` denied → a symlink `./project/key` → `~/.ssh/id_rsa` is **blocked** (target fails allow **and** matches deny).
- `Cd` deny goes further: checks **every spelling of the target, including each symlink hop it resolves through**.
- **Two subsystems, one access — deny resolves first.** A file reached via a symlink can *both* match a `paths:` rule (v2.1.198, so the rule's instructions *would* load) *and* be blocked by a permission deny. The permission gate is a hard client-side check that wins before any rule-context matters → the rule never takes effect on a denied read. Don't let "the rule matches" distract from "the read is denied."

**Trap:** treating `paths:` frontmatter as a permission filter (it's **context-loading** scope, never denies a read); assuming allow rules only check the link's own path (they need the target too — the asymmetry is the whole point).

*(source: [code.claude.com/docs/en/permissions](https://code.claude.com/docs/en/permissions) — symlink resolution for Read/Edit and Cd rules)*

---

### Headless reproducibility — `--bare` is a discovery switch, not a sandbox

> **`--bare` = deny-by-default on *ambient config*: skips auto-discovery of hooks, skills, plugins, MCP servers, auto-memory, CLAUDE.md. Config flips from *discovered* (varies per machine) → *declared* (identical everywhere). "Only flags you pass explicitly take effect."**

**The reproducible-CI recipe = two moves together:** ① `--bare -p` establishes a clean room (no ambient inputs; default tools = Bash + file-read + file-edit only); ② inject exactly what you want as **data via flags** — `--append-system-prompt[-file]`, `--settings <file|json>`, `--mcp-config <file|json>`, `--agents <json>`, `--plugin-dir/--plugin-url`. Reproducibility = clean baseline **+** explicit declaration; neither half alone suffices.

- **Plain `-p` is NOT isolated.** Print mode alone *"loads the same context an interactive session would"* — the stray `.mcp.json` and the teammate's `~/.claude` hook both fire. `-p` vs `--bare` is the whole question. (Note: docs say `--bare` *will become the `-p` default in a future release* — watch future-tense phrasing.)
- **`--bare` ≠ `--strict-mcp-config`.** `--strict-mcp-config` isolates **MCP only** (ignore discovered `.mcp.json`, use only `--mcp-config`); it does nothing about a discovered hook, memory, or plugin. A distractor built on it solves half the problem.
- **Auth shifts under `--bare`:** skips OAuth + keychain → creds must come from `ANTHROPIC_API_KEY` or an `apiKeyHelper` in the `--settings` JSON (Bedrock/Vertex/Foundry use provider creds). A "reproducible CI" scenario relying on interactive login is self-contradicting.

**The ceiling `--bare` can't reach — precedence:** `managed → CLI flags → local → project → user`. `--bare` isolates you from everything **below** CLI flags (user/project/local discovery) but **not** from **managed settings**, which sit *above* your flags. So an org policy (`allowManagedMcpServersOnly`, `deniedMcpServers`) can override a `--mcp-config`-injected server, and byte-for-byte-identical flags can still change behavior when policy shifts underneath. **Reproducibility is guaranteed only *relative to a fixed managed baseline*.** For a security team that's the desired property (org policy must win); the mental model: **`--bare` closes the door below; managed settings are the ceiling above — neither reaches the other.**

**Traps:** treating plain `-p` as isolated (it inherits everything); `--strict-mcp-config` as a full clean-room (MCP-only); expecting `--bare` to suppress managed policy (backwards — that would defeat org security by design); "identical flags ⇒ identical behavior" (ignores the managed ceiling); relying on interactive/keychain auth in a bare run.

*(source: [code.claude.com/docs/en/headless](https://code.claude.com/docs/en/headless) · [settings](https://code.claude.com/docs/en/settings))*

---

### Session resume vs continue vs memory

> **Resume = re-address a *conversation*. Memory = persist *facts*. Different concerns — don't cross them.**

| Goal | Mechanism |
|---|---|
| Human: find & return to a specific session | **Name it** (`claude -n "name"` at start, or **`/rename`**) → **`claude --resume <name>`** |
| Script: always hit one exact thread | **`claude --resume <session-id>`** (immutable ID — most robust) |
| "Keep going" — most-recent, one project | **`claude --continue`** |
| Browse when you don't recall the handle | **`--resume` / `/resume`** with no arg → interactive picker |
| **Continue the *same* thread further** (recover from a limit, follow up) | **resume** (`resume`/`fork_session:false`) |
| **Branch to a *different* direction, keep original intact** | **fork** (`fork_session: true` / `forkSession: true`) |
| Persist *facts/instructions* across sessions | **CLAUDE.md / memory dir** — *not* session resume |

**SDK resume vs fork (Agent SDK `query()` options):** *resume* re-addresses **one** thread and adds to it (same session ID, full prior context). *fork* makes a **new** session that starts with a **copy** of the history and diverges — original ID/history untouched → two independent sessions.
- **Recover from `error_max_turns` / `error_max_budget_usd`** → **resume with a higher `max_turns`** (the doc's named recovery path). `max_turns` is a **per-`query()` option**, settable on *any* call (resume, fork, or fresh) — it is **not** a fork-only capability.
- **Fork only when you want the original preserved for comparison / a "go back" option** while exploring an alternative — *not* to "give it more room to keep going."
- Sessions persist the **conversation, not the filesystem** — a forked agent's file edits are real and visible to siblings in the same dir (use **file checkpointing** to branch/revert files).
- Decider: *"keep going on the one investigation"* → **resume**; *"two threads I can compare later / don't alter the original"* → **fork**.

- **`--continue` = most-recent session in this project.** Breaks under **parallel same-day sessions** (ambiguous "most recent") → use `--resume <name/id>` to disambiguate. This is the usual exam disqualifier.
- **`--resume` takes name | id | (nothing → picker).** Every session always has a resumable **ID**; `-n`/`/rename` adds a *human-memorable* handle on top (v2.1.76+).
- **Automation:** `--continue` + `-p` in scripts can spawn a **new** session instead of resuming → for reliable headless threading use `--resume <id>` (immutable; name is mutable + a known rename-drop edge case).
- **Scope:** sessions are **per-project** (`~/.claude/projects/…`, indexed in `~/.claude/history.jsonl`); resume surfaces the current project's sessions.

**Traps:** `--continue` when sessions run in parallel (grabs the wrong one); writing transcript/context into **CLAUDE.md** to "resume" (category error — that's knowledge, not the conversation; new session starts fresh); interactive `/resume` picker inside a **headless** `-p` script (no TTY → no-op/hang).

*(source: [code.claude.com/docs/en/sessions](https://code.claude.com/docs/en/sessions) · [agent-sdk/sessions](https://code.claude.com/docs/en/agent-sdk/sessions))*

---

### Instruction files (CLAUDE.md / rules) — concatenated, never overridden

> **Instructions = *context*, so every discovered file is ADDED; nothing is discarded. Load order is broad → specific; on a direct conflict the closer file only *softly* wins — a lean, not a mechanical override.**

- **Load order (broad → specific):** managed policy → user (`~/.claude/CLAUDE.md`) → project (`./CLAUDE.md` or `./.claude/CLAUDE.md`) → local (`CLAUDE.local.md`, gitignored) → nested subdir files. **Closer = read last.**
- **Eager vs lazy — the exact trigger.** Working-dir + **ancestor** files load **at launch, in full**. **Subdirectory** (below launch) files are **lazy**: docs (verbatim) — *"they are included when Claude **reads files** in those subdirectories."* The trigger word is **"reads files"** — not "accesses"/"touches"/"works with." An Edit forces a preceding Read (unread-file gate), so the **read** is the load moment; the edit isn't a separate trigger. **Deferred ≠ disabled** (it loads on first read) and **≠ replace** (it's *added* — nothing is dropped). **Undocumented (doc-silent):** whether **Grep/Glob** trigger it (own experiment: they **don't** — Glob matches names only, Grep scans via search engine, neither is a Read-tool "read files" event), and whether a **partial read** (`offset`/`limit`) counts. For the exam, anchor on the phrase **"reads files in those subdirectories"**; keep Grep/Glob as real-world knowledge, not a testable fact. *(source: [code.claude.com/docs/en/memory](https://code.claude.com/docs/en/memory))*
- **"Soft-win" is a *tendency*, not a resolver.** There is **no engine** that compares conflicting lines and picks one — all files sit in context together and the model reconciles at generation time. The closer/more-specific instruction *tends* to be followed (from **specificity + recency**), but resolution is **not guaranteed** — docs: Claude "may pick one arbitrarily." Inspect what **actually loaded** with **`/context`** (not `/memory` — see *Instruction observability* below).
- **Need a guarantee? Don't use an instruction file.** A rule that must *definitely* win is an **enforcement** job — hook (`PreToolUse` deny) / permission rule / constrained decoding (config), not a CLAUDE.md line ("a guarantee needs code, not a prompt" — [90](90-cross-cutting-reflexes.md)). The reliable fix for fighting files is to **remove the contradiction**, not to rank them.
- **Managed-policy CLAUDE.md loads first and CANNOT be excluded** (no opt-out) — but "cannot be excluded" = **presence, not precedence**: it still competes as *context* and does **not** hard-override a conflicting rule. For genuinely unoverridable *behavior* an admin uses managed **settings** (hooks/permissions = config), not a managed instruction. Lives at the managed path (see enterprise deployment below), or inline via a **`"claudeMd": "..."` key** in `managed-settings.json`.
- `.claude/rules/` load at the **same priority as CLAUDE.md**; their scope comes from **`paths:` frontmatter**, not location → see the rules section above.

**Traps:** treating CLAUDE.md like override *config* (it's concatenated *context* — nothing is dropped); "the project file **deterministically** wins a conflict" (it only softly leans — never rely on it as a hard rule); expecting the project file to "replace" the user file (both load; closer is just read last); assuming managed-policy CLAUDE.md hard-overrides (it can't be *removed*, but doesn't *out-rank* on conflict); writing transcript/state into CLAUDE.md to "resume" a session (category error — see session resume above).

*(source: [code.claude.com/docs/en/memory](https://code.claude.com/docs/en/memory))*

---

### Choosing a config home — the three axes (the Q3/Q16 trap)

> **Before picking a file/flag, resolve THREE independent questions. A wrong option usually fails exactly ONE axis — name which.**

| Axis | Question | Splits |
|---|---|---|
| **Scope** | one repo, or all repos? | `./CLAUDE.md` · `CLAUDE.local.md` · nested `sub/CLAUDE.md` = **this repo** · `~/.claude/CLAUDE.md` = **all repos** |
| **Sharing** | committed (team) or git-ignored (personal)? | `./CLAUDE.md` **committed** · `CLAUDE.local.md` **git-ignored** · `.claude/rules/` **IS tracked** (committed) |
| **Persistence** | durable file, or ephemeral runtime flag? | `CLAUDE.md` file · `--append-system-prompt` flag (per-invocation) |

- **`CLAUDE.local.md` is the unique cell: *this-repo scope* + *git-ignored/personal*.** That's the answer for "my sandbox DB URL, this repo only, never committed" — **not** `~/.claude/CLAUDE.md` (wrong scope — bleeds into all repos) and **not** `.claude/rules/` (git-tracked → gets committed & shared).
- **"Personal" is ambiguous — it does NOT fix the scope.** `.local` (narrow, this repo) and `~/.claude` (broad, all repos) both *feel* personal; resolve the **scope** axis separately from **sharing**. (Same direction-slip family as the acceptEdits "prompt" inversion above.)
- **"Consistent / for the team / in CI" ⇒ committed file**, never a runtime flag in a runner's shell profile. A CI runner is disposable; the flag doesn't travel with the code. The committed `CLAUDE.md` is read by *every* checkout on *every* runner. (Q3: chose `--append-system-prompt` in a shell profile — fails **persistence + sharing**.)
- **Git-ignored ⟺ invisible-to-CI are the SAME property.** You cannot have a personal, uncommitted file (`CLAUDE.local.md`) drive CI behaviour — CI runs from a clean checkout and only sees committed files. Wanting "personal checks that run in CI" is self-contradictory on the sharing axis.
- **Already-committed file can't be made private by just `.gitignore`-ing it** — it stays tracked until `git rm --cached`. `.gitignore` only stops *future* untracked files.

**Traps:** `~/.claude/CLAUDE.md` for "this repo only" (fails **scope**); `.claude/rules/` for "keep it private" (fails **sharing** — tracked); runtime flag for "consistent/CI/team" (fails **persistence + sharing**); expecting a git-ignored file to reach CI (it can't).

*(source: [code.claude.com/docs/en/memory](https://code.claude.com/docs/en/memory))*

---

### `settings.local.json` — the personal-config cell (`.json` settings ≠ `.md` memory)

> **The three-axes "personal + this-repo + never-committed" answer for *settings* is `.claude/settings.local.json` — NOT `CLAUDE.local.md`. The `.local` twins live on different tracks: `.md` = memory (instructions), `.json` = settings (config). Match the file to what's being stored.**

- **`.md` = memory (instructions/context), `.json` = settings (structured config).** A sandbox **DB URL + preferred fixtures**, an allow-rule, a model pin = *config* → `settings.local.json`. Coding conventions / review steps = *instructions* → `CLAUDE.md`. Picking `CLAUDE.local.md` for config-shaped data is the seam trap (mirror of the memory-side [three-axes section](#choosing-a-config-home--the-three-axes-the-q3q16-trap) above).
- **The two `.local` twins diverge on TWO axes** (don't assume they behave alike):

  | Axis | `settings.local.json` (config) | `CLAUDE.local.md` (memory) |
  |---|---|---|
  | **Git-ignore** | **self-excludes** — verbatim: *"When Claude Code **saves a setting to this file** in a repository that doesn't already ignore it, Claude Code adds `**/.claude/settings.local.json` to your **global git excludes**."* Trigger = a *settings save*, not any file write; target = global excludes (`core.excludesFile` if abs/`~`-path, else `$XDG_CONFIG_HOME/git/ignore`, else `~/.config/git/ignore`); entry = the **glob** `**/.claude/settings.local.json`; skipped if already ignored | **manual** — docs say *"add it to `.gitignore`"*; no auto mechanism |
  | **Worktree** | **shared** — read from the **repo root**, resolved through worktrees → one file covers all subdirs/worktrees | **per-checkout** — *"exists only in the worktree where you made it"* → copy per worktree, or import `@~/.claude/…` |

  Mnemonic: **settings = repo-wide + self-hiding; memory = checkout-local + hide-it-yourself.** So "add the filename to the repo's **`.gitignore`**" is the wrong mechanism for *both*: `.gitignore` is a *tracked, shared* file — committing an ignore-rule for your personal file leaks it into the shared repo. Personal ignores belong in **global excludes**, which `settings.local.json` auto-wires and `CLAUDE.local.md` needs you to do by hand.
- **`CLAUDE.local.md` is current & supported — NOT deprecated** (verified vs live memory docs 2026-08; the "deprecated" belief was a stale search-snippet + GitHub-issue-title artifact). It's the memory cell for personal, this-repo, git-ignored *instructions* (docs' example: *"Your sandbox URLs, preferred test data"*), loaded in full at launch, appended after `CLAUDE.md`. Still the **wrong file for config-shaped data** (a DB URL used as a *setting*, an allow-rule, a model pin → `.json`). The `.md`-vs-`.json` seam stands; the deprecation claim does not.
- **Memory discovery = two exact filenames.** The upward walk matches **only** `CLAUDE.md` and `CLAUDE.local.md` at each level — *not* a `CLAUDE.*` prefix. A custom name (`CLAUDE.my-notes.md`) or a home-dir file is invisible to discovery → reaches context **only** via `@import`. (Importing the auto-discovered `@CLAUDE.local.md` is redundant — double-loads.) Ancestor files (root/parents of cwd) load **eager at launch**; subdir files below cwd are **lazy** (on first read there).
- **Merge is per-key, NOT whole-file replace** — `settings.local.json` layers *on top of* the committed `settings.json`; non-conflicting keys from both survive:
  - **Conflicting scalar** (`model`, `env` value, `outputStyle`) → **local wins** ("the repository root's value wins").
  - **Permission rules** (`allow`/`ask`/`deny`) → **union across both files** ("permission rules from both files stay in effect"), and **`deny` beats `allow`** regardless of file — you can't `allow` your way past a project `deny`.
- **Full settings precedence (highest → lowest):** `Managed → CLI args → Local (settings.local.json) → Project (settings.json) → User (~/.claude/settings.json)`. Local beats Project and User — but **Managed sits above even Local** (the one case "local wins" is false; see the `--bare` managed-ceiling note above). Read from the **repo root**, resolved through worktrees, so one file covers any subdir/worktree session.

**Traps:** `CLAUDE.local.md` for a URL/fixtures used as a *setting* or an allow-rule (wrong file *type* — config → `.json`; `CLAUDE.local.md` is for *instructions* and is **not** deprecated — don't answer "deprecated"); hand-editing the repo's `.gitignore` to hide a personal file ("never committed" but you just committed the ignore-rule → use global excludes, which `settings.local.json` auto-wires); "the files replace each other" (per-key merge, not whole-file); `allow` overriding a `deny` (deny always wins, cross-file); forgetting **Managed** out-ranks Local.

*(source: [code.claude.com/docs/en/settings](https://code.claude.com/docs/en/settings) — precedence & merge · [memory](https://code.claude.com/docs/en/memory) — CLAUDE.local.md is current/supported, worktree-local)*

---

### `claude-code-action` v1.0 migration — three buckets (subdomain 3.6, the Q9 trap)

> **v1.0 makes the action a thin CLI pass-through. Migrating a beta config sorts every field into ONE of three buckets — `claude_args` is NOT a dumping ground.**

| Bucket | Beta field → v1.0 |
|---|---|
| **Dropped** (auto-detected) | `mode` — gone; inferred from context (tag vs PR) |
| **Renamed, STAYS a top-level named input** | `direct_prompt` → `prompt` · `anthropic_api_key` **unchanged** (never a flag) |
| **Moved into `claude_args` as CLI flags** | `custom_instructions` → `--append-system-prompt "…"` · `max_turns` → `--max-turns N` |

- **The one mapping worth memorizing cold: `custom_instructions` → `--append-system-prompt`.** Most-tested, least-guessable. Everything else you can recognize by elimination.
- **CLI flags use HYPHENS; the old beta *inputs* used underscores.** `--max-turns` (flag) vs `max_turns` (dead input). `--max_turns` is a classic distractor.
- **`claude_args` is ONE value holding ALL flags** (space-separated or a YAML block scalar). Two `claude_args:` keys = YAML overwrite (one silently lost).
- **Don't over-migrate.** `prompt` and `anthropic_api_key` are first-class named inputs — pushing them into `claude_args` is wrong (and a secret-in-args smell). This is the mirror of the under-migration miss: *some* fields stay named inputs, *some* become flags — sort by bucket, don't apply one rule uniformly.
- **Faithful migration ≠ redesign.** Migrating an existing `custom_instructions` → `--append-system-prompt` is the correct mechanical answer *even though* a fresh design might prefer `CLAUDE.md`. `--append-system-prompt` is action-invocation-scoped; `CLAUDE.md` is repo-wide — different layers, different behaviour. Don't overcorrect "prefer the file" onto a migration task.

**Correct v1.0 shape:**
```yaml
- uses: anthropics/claude-code-action@v1
  with:
    prompt: "…"                       # was direct_prompt
    anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}   # unchanged
    claude_args: |                    # mode dropped; the rest as flags
      --append-system-prompt "…"      # was custom_instructions
      --max-turns 8                   # was max_turns
```

**Traps:** keeping `mode`/`custom_instructions`/`max_turns` as top-level inputs (all beta artifacts); `--max_turns` underscore; pushing `prompt`/`anthropic_api_key` into `claude_args`; two `claude_args` keys; mapping `custom_instructions` → `prompt` (it's an instruction, → `--append-system-prompt`, not a prompt).

*(source: [github.com/anthropics/claude-code-action](https://github.com/anthropics/claude-code-action) — v1 migration)*

---

### Commands ARE skills — one system, invocation is a frontmatter axis (not a mechanism choice)

> **"Custom slash command vs skill" is a dead distinction: custom commands have been *merged into* skills.** `.claude/commands/deploy.md` and `.claude/skills/deploy/SKILL.md` both create `/deploy` and behave the same. `.claude/commands/` files keep working; skills are the superset (add a supporting-file dir, `disable-model-invocation`/`user-invocable` frontmatter, and Claude-can-auto-load). **So the real question is never "command or skill" — it's *who may invoke this one skill*.**

- **Default = BOTH can invoke.** You type `/name`; Claude auto-loads it when the `description` matches. The two frontmatter fields *subtract* from that default (they don't define "command-ness"):

  | Frontmatter | You (`/name`) | Claude (auto) | Description in context |
  |---|---|---|---|
  | *(default)* | ✅ | ✅ | Always (full body loads on invoke) |
  | `disable-model-invocation: true` | ✅ | ❌ | **Not** loaded (loads only when you invoke) |
  | `user-invocable: false` | ❌ | ✅ | Always |

- **The 8-step deploy checklist maps here.** A stored procedure → a skill (body loads on demand, ~zero per-turn cost). To get the old "command" feel — *only I trigger it, Claude won't auto-run a deploy because the code looks ready* — add **`disable-model-invocation: true`** (the docs' literal `/deploy` example). That's a **flag on one skill**, not "make it a command instead of a skill."
- **Auto-invocation is a *feature you can turn off*, not the definition of a skill.** Manual `/name` isn't unique to old commands — every user-invocable skill has it. So "command = manual, skill = auto" is a false split; both live on one axis of one system.
- Distinct from *subagents* (`.claude/agents/`): a subagent's body is a *separate agent's system prompt* that runs in an **isolated context** and returns a summary — delegate-and-isolate, not store-and-surface. It *can* physically hold a checklist, but invoking it hands execution to another agent instead of surfacing steps in the main session. See the invocation-control cluster in *SKILL.md frontmatter* below.

**Traps:** treating "custom slash command" and "skill" as two mechanisms to choose between (unified — same `/name`, same behavior); "command = manual-only, skill = auto-only" (both invoke modes belong to one skill; the axis is `disable-model-invocation`/`user-invocable`); routing a store-and-surface procedure to a **subagent** because it "also loads on demand" (shared property ≠ shared purpose — subagent = delegate/isolate).

*(source: [code.claude.com/docs/en/skills](https://code.claude.com/docs/en/skills) — "Custom commands have been merged into skills", Control who invokes a skill · [commands](https://code.claude.com/docs/en/commands) · [sub-agents](https://code.claude.com/docs/en/sub-agents))*

---

### Skills / commands precedence — one wins, and Personal BEATS Project

> **Skills & commands are *config* → exactly one definition is selected by name, the rest discarded. Ladder: `Enterprise > Personal > Project > bundled`. ⚠️ Personal beats Project — the REVERSE of MCP scopes.**

- **`/name` runs the highest present rung:** Enterprise (org-pushed) → **Personal** (`~/.claude/skills/`) → **Project** (`.claude/skills/`) → **bundled**.
- **bundled = ships built-in with Claude Code** (`/review`, `/code-review`, `/security-review`, `/init`, `/run`…). Weakest rung — **overridable**: drop your own `code-review` in `~/.claude/skills/` and `/code-review` runs **yours**, not Anthropic's.
- **Plugin skills are namespaced** (`plugin-name:skill-name`) → they **never collide**; reach one with `/myplugin:code-review`. A bare `/code-review` still resolves down the personal → project → bundled ladder.
- **Skill vs same-named `.claude/commands/` command → skill wins.**
- **Nested subdir skills don't override** — both stay available under a qualified name (`apps/web:deploy`); Claude picks the variant matching the files in play.
- ⚠️ **Verified nuance — "Enterprise" for *skills* is undocumented/unimplemented.** The precedence *table* lists it, but the docs describe **no managed-settings path that deploys a skill**. Top *usable* rung today = **Personal**. Don't invent a managed skills location.

**Enterprise deployment (what managed policy *can* push):** settings + CLAUDE.md, via an admin-only **`managed-settings.json`** users can't override —

| Platform | Managed path |
|---|---|
| macOS | `/Library/Application Support/ClaudeCode/managed-settings.json` |
| Linux / WSL | `/etc/claude-code/managed-settings.json` |
| Windows | `C:\Program Files\ClaudeCode\managed-settings.json` |

Deployed by **MDM** (Jamf/Kandji), **Group Policy / Intune** (Windows HKLM `…\Policies\ClaudeCode`), **config-mgmt** (Ansible/Puppet), or **server-managed** settings from the claude.ai admin console (Teams/Enterprise). A managed `CLAUDE.md` sits in the same folder or inline via the `claudeMd` key.

**Traps:** "bundled wins / is the default winner" (it's the *loser* — lowest rung); "Project beats Personal" (reverse — Personal wins; flipping these two is *the* direction trap); assuming skills share MCP's `Local>Project>User` direction; inventing a managed-settings **skills** deployment path (settings & CLAUDE.md yes, skills **not documented**).

*(source: [code.claude.com/docs/en/skills](https://code.claude.com/docs/en/skills) · [admin-setup](https://code.claude.com/docs/en/admin-setup) · [server-managed-settings](https://code.claude.com/docs/en/server-managed-settings) · [memory](https://code.claude.com/docs/en/memory))*

---

### Headless I/O contract — output rich, input bounded

> **The CI-pipeline pair (subdomain 3.6): structured output is self-contained; piped input is size-capped and fails loud.**

- **`-p --output-format json` → the result JSON already carries observability — no side log, no extra flag.** Fields include **`total_cost_usd`** (per-invocation cost), a **per-model cost breakdown**, and token usage (`total_input_tokens`, `total_output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`) + duration. Parse it (`jq '.total_cost_usd'`); don't reach for a separate cost log.
- **Piped stdin is capped at 10MB.** Over the cap → **immediate error exit, non-zero status** — **not** partial processing, **not** a shell/redirection incompatibility. `cat huge.log | claude -p …` that dies is the *size limit*, and **none** of it was analyzed.

**Traps:** "cost tracking needs a separate flag/log file" (it's in the JSON — `total_cost_usd`); blaming a big-stdin failure on shell redirection (it's the 10MB cap — fail-fast, zero processed); expecting oversized input to truncate/degrade gracefully (it hard-errors).

*(source: [code.claude.com/docs/en/costs](https://code.claude.com/docs/en/costs) · [headless](https://code.claude.com/docs/en/headless))*

---

### Instruction observability — five tools, five jobs (the `/memory` vs `/context` trap)

> **First ask *did it load?* If loaded but ignored, it's an *adherence* problem, not a loading one. Five distinct tools sit on three concerns: catalog · snapshot/timeline · enforcement · filter — never mix them.**

| The task asks… | Tool | Type |
|---|---|---|
| Does it **exist / where / edit it**? | **`/memory`** | catalog (lists *configured* locations, incl. files that don't exist yet) |
| Is it **loaded right now** (this session)? | **`/context`** → Memory files list | snapshot |
| **Which files loaded, *when*, *why*** (across the session)? | **`InstructionsLoaded` hook** | timeline (auto, durable; docs recommend it for path-scoped / lazy subdir rules) |
| Loaded but **must be obeyed** (hard guarantee)? | **PreToolUse** (block before) / **PostToolUse** (correct/verify after) hook | enforcement |
| **Stop it loading** (for me, non-destructive)? | **`claudeMdExcludes`** (settings.local.json) | filter |

- **`/memory` ≠ `/context` — "listed ≠ loaded."** `/memory` shows what's *configured* (it lists user/project CLAUDE.md entries **even for files that don't exist**). Presence there proves the file is *known*, **not** that it entered context. Confirming *loaded this session* is **always `/context`**. (Docs verbatim: *"To check which files actually loaded into the current session, run `/context`."*)
- **Snapshot vs timeline.** *"Is it in context now?"* → `/context`. *"Did the trigger fire, and when/why?"* → `InstructionsLoaded` hook. Canonical two-step for a path-scoped rule that seems ignored: **`/context` to detect the absence → `InstructionsLoaded` to explain it.**
- **Path-scoped caveat:** `/context` only shows a `paths:`-scoped rule **after** a matching file has been read this session — its absence *before* a matching read is expected, not a bug.
- **Load vs adherence — the top-level branch.** If `/context` shows the rule loaded but Claude still ignores it, the problem is **adherence**, not loading. Rules are *context, not enforced config* — Claude "tries to follow, no guarantee, especially for vague/conflicting instructions." **Adherence ladder:** ① make it *specific* → ② *remove conflicts* → ③ *structure + few-shot examples* → ④ (still not enough / must hold every time) *enforce with a hook*. Hooks enforce **mechanically** (block, lint, validate) — they fit *checkable* rules; genuinely judgment-based conventions stay in the specificity/examples lane.

**Traps:** using `/memory` to check if a rule is *loaded* (it only confirms *configured*); using `claudeMdExcludes` to *diagnose* loading (it *removes* the file — anti-diagnostic; "excluding to see if it would load" = unplugging a device to check if it's on); treating a loaded-but-ignored rule as a *loading* bug (it's adherence → specificity/hook, not `/context`).

*(source: [code.claude.com/docs/en/memory](https://code.claude.com/docs/en/memory) — Troubleshoot: `/context` Memory files, `InstructionsLoaded` hook, `claudeMdExcludes`; hooks-guide)*

---

### SKILL.md frontmatter — four clusters, four axes

> **Every frontmatter field sits on ONE of four axes. Mixing them up is the trap: a question asking about *one* axis offers distractors from the *others*.**

| Cluster | Fields | Axis / question it answers |
|---|---|---|
| **Invocation control** | `disable-model-invocation: true` · `user-invocable: false` | who/whether it's triggered |
| **Activation gating** | `paths` (hard glob) · `when_to_use` (soft semantic) | when Claude **auto-loads** it |
| **Tool permissions** | `allowed-tools` · `disallowed-tools` | prompting **vs** availability (different axes — *not* opposites) |
| **Execution tuning** | `model`/`effort` · `context: fork`/`agent`/`background` | how/where it runs (lightweight in-turn **vs** heavyweight isolated) |

**Invocation control (opposite gates):**

| Field | You invoke (`/name`)? | Claude auto-invokes? | Description in context? |
|---|---|---|---|
| `disable-model-invocation: true` | ✅ | ❌ | No (loads only when you invoke) |
| `user-invocable: false` | ❌ | ✅ | Yes (always in context) |

- Decider: *"manual only / Claude shouldn't auto-run"* → `disable-model-invocation`. *"hide from `/` menu / Claude-only background knowledge"* → `user-invocable: false`.
- ⚠️ `disable-model-invocation: true` **kills all auto-loading** → makes `paths` a no-op (filtering an off signal is still off).

**Activation gating:** `paths` = **deterministic file-glob** auto-load (same glob format as path-scoped rules). `when_to_use` = **fuzzy natural-language** trigger hints appended to the description. `paths` only gates **auto-activation** — it does **not** gate **manual `/name` invocation** (works on any file when you invoke) and does **not** scope the skill's **behavior** (that's the markdown body). *Invocation ≠ application.* `paths` is a soft convenience gate, not a guardrail.

**Tool permissions — the key axis distinction (drilled hard):**

| Field | Axis | Effect | If absent |
|---|---|---|---|
| `allowed-tools: Bash(git commit *)` | **prompting** | runs **without asking** (tool stays available) | tool still runs, but **prompts** per mode/rules |
| `disallowed-tools: AskUserQuestion` | **availability** | **removed from the pool** — can't run at all | tool **is** available (may prompt) |

- **`allowed-tools` = "don't ask me," NOT "restrict."** Docs verbatim: *"It does not restrict which tools are available: every tool remains callable."* So `allowed-tools: Write Edit` does **not** stop Bash/`rm` — it only silences prompts on Write/Edit. **The field that *restricts* is `disallowed-tools`.** (This is why the "limit a skill to file-writes" exam item is subtly mis-keyed toward `allowed-tools`; the *correct concept* is `disallowed-tools`.)
- **Grant is per-*turn*, not per-call:** covers **every** call to a listed tool for the whole turn that invoked the skill, and **clears on your next message** (re-invoke to re-apply). `disallowed-tools` block is turn-scoped the same way.
- **Named "opposites" but different axes** — `allowed`=prompting, `disallowed`=availability. Don't read them as a symmetric pair (exam bait). Note `disallowed`, deliberately **not** `denied`: `deny` (settings) refuses a call on the ask-axis; `disallowed` removes from the pool.
- **Durable version lives in settings, not the skill:** `allow` rules (session-wide pre-approve) / `deny` rules or PreToolUse hook (hard forbid). Skill fields are turn-scoped guidance/grants.
- Neither field can remove **`EndConversation`** while another tool remains.
- **Project skills are trust-gated:** a committed skill's `allowed-tools` takes effect only **after you accept the workspace trust dialog** — a repo can't grant itself broad tool access on clone. Substitution: `${CLAUDE_SKILL_DIR}` expands in both the body and `allowed-tools` (v2.1.129+) so a bundled script runs prompt-free.

**Execution tuning — lightweight vs heavyweight (the Q7 miss):**
- *"tune model/effort, only while active, revert after this turn"* → **`model` + `effort`** (in-turn override, auto-reverts on next prompt; not saved to settings).
- *"isolate / no conversation history / runs separately"* → **`context: fork`** (+ `agent` = which subagent type, `background` = detached[default] vs block-the-turn `false`).

**Content lifecycle:** invoked skill content enters the transcript and **persists for the session** (write standing instructions, not one-time steps — Claude doesn't re-read the file). But the **`allowed-tools` grant is turn-scoped** — content stays, permission clears.

**Full tool-control 2×2 (skill ⟂ settings):**

| | Pre-approve (grant) | Restrict (block) |
|---|---|---|
| **Turn-scoped (skill)** | `allowed-tools` | `disallowed-tools` |
| **Durable (settings)** | `allow` rule | `deny` rule (+ PreToolUse for hard enforcement) |

**Traps:** `allowed-tools` "restricts what the skill can do" (no — grant only; use `disallowed-tools` to restrict); reading allowed/disallowed as same-axis opposites; `disable-model-invocation` where `user-invocable: false` was needed (kills auto-load); `paths` "restricts behavior / gates manual invocation" (only auto-activation); `context: fork` for a model/effort tweak (that's `model`/`effort` — fork is isolation); expecting a skill grant to survive your next message (turn-scoped).

*(source: [code.claude.com/docs/en/skills](https://code.claude.com/docs/en/skills) — Frontmatter reference, Pre-approve tools, Skill content lifecycle, Control who invokes)*

---

### Plan × Auto composition — plan blocks writes, auto frees reads

> **`useAutoModeDuringPlan` (default ON when auto mode is available) stacks the two: plan mode blocks *edits*, auto mode's classifier auto-approves *read-only actions*. Availability of auto mode is the switch that flips observable behavior.**

- **Plan mode alone** = *"prompts apply as in Manual mode"* — it blocks **edits** but does **not** silence non-read-only shell commands on its own.
- **Auto available + `useAutoModeDuringPlan` on (default):** the classifier auto-approves **read-only** searches/reads without prompting; **edits stay blocked** until you approve the plan. → *reads flow silently + edits blocked* = **both mechanisms stacked**.
- **Auto unavailable:** plan falls back to the **Manual baseline** — only **reads + the built-in read-only command set** run silently; **`touch`/`rm` and other non-read-only shell commands prompt.**
- **Even with auto active during planning, `touch`/`rm` still prompt** (docs: "including when auto mode is active during planning"). The classifier frees read-only *searches/reads*, **not** file-modifying commands, under plan.

**"Read-only" = a fixed allowlist, NOT "anything that only reads."** Silence covers ① the built-in **read tools** (`Read`/`Grep`/`Glob`) and ② shell commands **on the built-in read-only command set**. A shell command that merely inspects state but **isn't on the allowlist still prompts** (Manual/plan) or routes to the classifier (auto). `touch` prompts because it's **not on the allowlist**, not because it's "more than a read."

**Mental model:** *Plan blocks writes; auto's classifier frees reads. Remove auto → plan reverts to Manual (only allowlisted reads silent).* Decider on a scenario: **is auto mode available?** yes → read-only *commands* silent; no → only reads + built-in read-only set silent.

**Traps:** "plan mode exempts all reads/non-edits from prompts" (only reads + built-in read-only set unless auto is riding along); "read-only = any command that only reads" (it's an allowlist); expecting `rm`/`touch` to run silently under plan+auto (they still prompt — plan's edit-block + non-read-only both hold).

*(source: [code.claude.com/docs/en/permission-modes](https://code.claude.com/docs/en/permission-modes) — plan mode `useAutoModeDuringPlan`, classifier decision order; [permissions](https://code.claude.com/docs/en/permissions) — built-in read-only commands)*

---

### AGENTS.md `@import` + version-gated path-rule behaviors

> **Claude Code reads `CLAUDE.md`, NOT `AGENTS.md`. To share one convention source, `@AGENTS.md`-import it (expansion, not reference). Several path-rule matching behaviors are version-gated — a stated version number in a stem is a live variable.**

- **AGENTS.md single-source:** `CLAUDE.md` starts with `@AGENTS.md`, Claude-specific rules below it. `@import` **expands the file inline** at launch (additive — it does **not** reduce context). Symlink alternative (`ln -s AGENTS.md CLAUDE.md`) works **only if** no Claude-specific additions — and on **Windows** needs Admin/Dev Mode, so **prefer the `@import`**.
- **`@import` mechanics:** relative-to-the-importing-file; recursive up to **4 hops**; **parsing skips code spans / fenced blocks** (`` `@README` `` is literal); **external** imports (resolve outside working dir, e.g. `@~/.claude/...`) trigger a one-time **approval dialog** — decline once → stays disabled silently.
- **Version-gated path-rule behaviors** (watch for a version number in the stem):
  - **v2.1.198** — path-scoped matching works through a **symlinked checkout** (file reached via a symlink *to the project dir* still matches the relative-path glob). Before it: may not match via the symlinked path.
  - **v2.1.207** — an **invalid `[` bracket** pattern matches nothing but **doesn't break sibling patterns**. *Before* it: one invalid pattern made the **Read tool fail for every file** the rule was evaluated against.
  - **v2.1.217** — many brace groups no longer stall/crash startup.
  - Escape a literal bracket: `photos \[2024\]/**`. Glob treats `[legacy]` as a **bracket expression**, not a literal folder.
- **Glob budget:** a rule's whole `paths` list shares **1,000 expanded patterns / 4 MiB**; **brace groups multiply** (`{ts,tsx}` = ×2), non-brace patterns don't count; over-budget patterns are used **unexpanded** (literal braces match nothing).
- **Distinct symlink feature (don't conflate):** `.claude/rules/` **directories** support symlinks for *sharing rule files across projects* — that's about where the rule file lives, unrelated to symlinked-checkout matching of the file being edited.

**Traps:** expecting Claude Code to read `AGENTS.md` natively (it doesn't — must import); "`@import` reduces context" (it expands in full at launch); path in backticks still importing (code spans are skipped); ignoring a stated version number (it gates symlink-match / bracket-isolation); reading `[legacy]` as a literal directory name (it's a glob bracket expression → escape it).

*(source: [code.claude.com/docs/en/memory](https://code.claude.com/docs/en/memory) — AGENTS.md, Import additional files, Path-specific rules)*

---

## To expand (next study sessions)

- [ ] Hooks config in `settings.json`: events (`PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `Stop`, `SessionStart`, `PreCompact`…), `matcher`, command hooks
- [ ] Hook I/O: JSON on stdin; `hookSpecificOutput.permissionDecision` = `allow`/`deny`/`ask` + `permissionDecisionReason`
- [~] `settings.json` vs `settings.local.json`; permission allow/deny lists; precedence *(permission **modes** done above · **settings-file precedence + per-key merge (scalar→local wins, permissions→union, deny>allow) + auto-git-excludes done above** — still to cover: full allow/ask/deny rule **syntax**, `deny > ask > allow` resolution within a single list)*
- [x] CLAUDE.md memory hierarchy (user / project / local) — concatenation & load order done above · **choosing a home (scope/sharing/persistence axes) done above** · still: keep-lean (<200 lines) guidance
- [x] `claude-code-action` v1.0 migration (three buckets: dropped / named-input / `claude_args` flags) — done above (subdomain 3.6)
- [~] Slash commands / subagents / skills — **skills precedence done above** · **SKILL.md frontmatter (4 clusters) done above** · **commands-are-skills unification + invocation axis done above** · still: subagent definitions (`.claude/agents/` frontmatter fields, delegate-and-isolate vs store-and-surface)
- [x] Instruction observability — five-tool model (`/memory` vs `/context` vs `InstructionsLoaded` vs Pre/PostToolUse vs `claudeMdExcludes`) + load-vs-adherence branch — done above
- [x] Plan × auto composition (`useAutoModeDuringPlan`) + read-only-allowlist nuance — done above
- [x] AGENTS.md `@import` + version-gated path-rule behaviors (symlink match v2.1.198, bracket isolation v2.1.207, glob budget) — done above
- [ ] MCP server config; the `.claude` directory layout overall
