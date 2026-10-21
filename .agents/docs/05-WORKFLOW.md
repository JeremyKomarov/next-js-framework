# Workflow — the plan, the guards, and shipping

`plan/` holds what the work is. This holds how it moves, and what stops it rotting.

## 1. The plan

```
plan/
  00-INDEX.md          the table of contents. Status only — never content.
  NOW.md               the one step in flight. Rewritten as the work moves. §2
  01-<slug>.md         one phase, one file.
```

`00-INDEX.md` is a table of `# | Phase | Status | File`, plus a **Now / Next** line. It holds no
detail of its own. Add a phase with the `new-phase` playbook — it writes the file and the row
together.

**A phase file that no longer fits on one screen is two phases.** That is the only sizing rule
that matters. An agent reads the phase it is working on, not the whole backlog, and small phases
finish, which is how a plan stays honest.

```md
# 03 — Workspace switching

**Goal:** a person with two workspaces can switch between them and every screen follows.
**Depends on:** 02
**Status:** in progress

## Steps
- [x] ~~03.1 — `workspaces.list` endpoint and its hook (M)~~
- [~] 03.2 — the switcher, wired to the active-workspace store (S)
- [ ] 03.3 — every screen reads the active workspace rather than the first row (M)

## Done when
Switching workspace on the dashboard changes what the queue screen shows, without a reload.

## Notes
Decisions taken while working. Promote anything the next person would be surprised by to
docs/DECISIONS.md, and say here that you did.
```

Sizes are **S / M / L**, never points — S/M/L answers the only question being asked, which is "is
this one sitting or several?"

> **A feature is not done when a function exists and exports cleanly. It is done when something
> calls it and the result is visible.** Every step that adds a capability names the caller that
> reaches it.

Write the done condition as something you could show someone on a screen, read out of a database,
or watch fail. "The adapter is implemented" is not a step; it is half of one.

**Never renumber phases.** Numbers are addresses — `03.2` may be cited from a commit message.
Add `07` after `06` even if it belongs conceptually in the middle, and say so in `Depends on`.
**Never put content in the index**, and **do not write phases you cannot start**.

## 2. Where the work is right now

`[ ]` not started · `[~]` **in progress, right now** · `[x]` done, and **struck through** so a
finished step reads as finished without counting brackets.

**The loop, every time:** mark the step `[~]` and write `NOW.md` **before** starting it; update
**State** when the picture changes; on finishing, strike the step, move `[~]` to the next one and
rewrite `NOW.md` — in the same commit as the work.

```md
**Step:** 03.2 — the switcher, wired to the active-workspace store
**Since:** 2026-09-05
**State:** switcher renders and lists both workspaces; the store write is not wired yet.
**Blocked by:** —
```

`NOW.md` is rewritten, never appended to — the struck-through steps are already the history.

**Four things say the same thing, or `npm run guard` fails:**

| | Says |
|---|---|
| the index row | `not started` · `in progress` · `done` |
| the phase file's `**Status:**` | the same word |
| the step markers in that file | `[~]` on exactly one step, if and only if the phase is `in progress` |
| `plan/NOW.md` | that step's id, with **Since** and **State** filled in |

**A status and a marker imply each other, in both directions.** A phase at `in progress` with no
`[~]` fails; a `[~]` under any other status fails. A phase whose steps are all struck must be
`done`, and a `done` phase may not have an unfinished step left inside it — move it to a later
phase instead of leaving it behind a green status. One phase in progress at a time.

`NOW.md` naming a step while **Since** and **State** are still `—` fails too. A working file that
names a step and says nothing about it is the same as an empty one.

That is why the loop is cheap to follow and expensive to skip. An agent that stops mid-step leaves
the next one a `[~]` and a `State` line; a plan nobody updated while working lies about where the
work is.

## 3. What enforces all of this

`npm run verify` = `typecheck` + `lint` + `guard` + `test`. It is the gate. Nothing merges red,
and running it is not the reviewer's job.

`npm run guard` is one command and four checks — plan, docs, styles, agents. `npm run guard --
--only=plan` runs one of them. **Every check exits 0 with a message when its target does not exist
yet**: a guard that fails on an empty project is a guard people delete.

| Rule | Enforced by |
|---|---|
| `01 §1` a feature never imports another feature | `eslint.config.mjs` — one generated zone per feature, its root included |
| every lint zone, both ways — what it refuses and what it allows | the framework's own CI — `bin/check-lint.mjs` |
| `01 §1` `shared/`/`core/`/`store/` never import a feature | same, with `core/i18n/messages.ts` as the one declared exception |
| `01 §8` nothing outside `server/` imports `server/` | same, plus `import "server-only"` at the top of every server file |
| `01 §6` no `../` imports | same |
| `01 §8` only `server/db/` imports a database client | same — inert when the folder is absent |
| `01 §8` `NEXT_PUBLIC_*` read outside `core/config/env.ts` | same — `no-restricted-syntax` |
| `02 §2` a stylesheet imported by anything but its `*.classes.ts` | same |
| `02 §2` a class name that does not exist | `classMap()` at runtime in dev; `guard` statically |
| `02 §7` no hardcoded colour outside `tokens.scss` — hex, colour functions, named colours | `guard` |
| `03 §2` an error code that does not exist | `ApiErrorCode` derived from `API_ERROR_CODES` |
| `04 §2` a route that ignores its feature flag | `featurePage()` is the only way a page is built |
| `04 §3` a feature with no index | `guard` |
| every citation resolves — `NN §N`, `rule NN N`, and a `§N` in a framework file, which must name its document | `guard` |
| every decision citation names its record and resolves — `.agents/docs/DECISIONS.md #N` (the framework's) or `docs/DECISIONS.md #N` (yours) | `guard` |
| every `.agents/` path a playbook, template, rulebook file or index names exists, in that exact case | `guard` |
| the code in `.agents/templates/` type-checks and lints in a real project | the framework's own CI — `bin/check-templates.mjs` |
| the plan index, the phase files and `NOW.md` agree (§2) | `guard`, and a `pre-commit` hook running it per commit — see below |
| a skill differs between agents, or is missing from one (§4) | `guard` |
| a `SKILL.md` frontmatter key Claude Code does not recognise, and so silently ignores (§4) | `guard` |
| a positional `$1` in a playbook — Claude Code counts from `$0`, so it is the second argument (§4) | `guard` |
| the plan and the skills, during a Claude Code session, not only at commit | `.claude/settings.json` hooks — `check --hook` |
| an agent editing `.agents/` in a project | a `deny` in the project's `.claude/settings.json`, written by the scaffolder |
| `npm run verify` itself, on every push | `.github/workflows/verify.yml`, written by the scaffolder |
| registry invariants the type system cannot state | `features.const.test.ts` |

**The plan check also runs on every commit, not only at `npm run verify`.** `npm install` wires
`core.hooksPath` to `.agents/kit/hooks` (`node .agents/cli.mjs hooks`, also the `postinstall`
script), so `git commit` refuses one that leaves the four things in the table above disagreeing —
before the drift is several commits old and someone has to reconstruct what was actually in
flight. `git commit --no-verify` still skips it, same as any hook; CI running the full guard on
every push is the check that cannot be skipped (`.agents/docs/DECISIONS.md #24`).

**Deliberately not mechanized:** naming, co-location, and "does `shared/` already have something
that does this" (02 §5, steps 1–3 and 7). Those need judgement, and a guard that is wrong often
enough gets ignored. The `sync-index` playbook is the halfway house — it reports drift between a
directory and its index without claiming to decide what a good description is. `audit-skills` is
the same halfway house aimed at the playbook roster itself: whether two skills overlap, and
whether one still means what it did when its citations were written.

**Tests** are Vitest over pure logic: error mapping, `classMap`, `keysOf`, mappers and DTOs,
environment parsing, registry invariants. Co-located as `<module>.test.ts`. There is deliberately
**no component rendering** — jsdom and a testing library are real maintenance, and what matters
more is a check on the logic that decides what a person sees when something fails.

**The dependency versions in the kit are a tested combination, not the latest of each.** Two
recent majors broke together and both fail at *config load* with a stack trace: TypeScript 7
(`typescript-eslint does not support TS 7.0`, so `eslint-config-next` cannot load) and ESLint 10
(`eslint-plugin-react` crashes inside `eslint-config-next`). Re-test both before bumping either.
"Use the latest" is right about the libraries you write against and wrong about a lint toolchain,
where four packages have to agree. So the scaffolder installs exact versions — the set the
framework's CI last proved — and a project moves on from there under its own lockfile.

## 3a. Read a section, not a file

```sh
node .agents/cli.mjs rule            # every section, one line each — the map
node .agents/cli.mjs rule 02         # that file's sections
node .agents/cli.mjs rule 02 7       # §7, and nothing else
node .agents/cli.mjs rule -q tokens  # which sections mention it
node .agents/cli.mjs rule 02 -q grid # the same, in 02 alone
```

**A citation is an address; this is what fetches it.** `02 §7` is ~400 words. `02-COMPONENTS.md`
is ~2,200. Opening the file to answer a one-section question costs five times what the answer
does, and an agent following three citations in a task pays for most of the rulebook without
being asked to read it.

That gap was the reason the tiering in `00-INDEX.md` under-delivered: tier 3 was addressed by
section and *retrieved* by file, so the precision in the address was decorative. Use `rule`
wherever you would have used `Read` on a rulebook file — including from an agent with no shell of
its own, via whatever it runs commands with.

The map is generated from the files themselves, so it cannot go stale, and it is cheaper than the
index describing it. `rule` with no arguments is the right first move when you do not yet know
which section you want.

## 4. Skills stay identical everywhere

**Change, add or delete a skill and both agents must see it in the same commit.** A stale copy is
worse than a missing one: an agent follows it confidently and does the superseded thing.

Two agents are supported — Claude Code and Codex (`.agents/docs/DECISIONS.md #26`).
`.agents/skills/` is canonical, and `AGENTS.md` is canonical.

| Agent | Reads `AGENTS.md` | Finds playbooks in | Runs one as | Needs wiring |
|---|---|---|---|---|
| **Codex** | natively — root down to the launch directory, once, at startup | `.agents/skills/` | `$name` | none |
| **Claude Code** | via a `CLAUDE.md` shim beside each one; nested ones load when it works there | `.claude/skills/` | `/name` | shims + mirror, written by `sync` |

**Neither agent reliably loads a directory's `AGENTS.md` at the moment it starts writing there.**
Codex reads only the ones on the path to where it was launched; Claude Code loads a nested one
lazily. That is why the lookup protocol in the root guide tells the agent to read the directory's
`AGENTS.md` itself — for Codex, that one sentence is the whole of tier 2.

**Codex stops reading project docs at 32 KiB** (`project_doc_max_bytes`), counted across the root
`AGENTS.md` and every nested one on the path, and cuts the rest off with no error. `guard` fails a
root `AGENTS.md` over 24 KiB, leaving room for the nested ones. Next appends its own block to the
root guide and `next dev` re-adds it, so the root is the one that grows.

The mirror is a symlink where the platform allows one, so an edit propagates with no action at all
and drift is impossible rather than managed. Where symlinks are refused, `sync` writes a verified
copy and the guard compares every file by hash.

```sh
npm run sync:agents    # the .claude/skills mirror, the CLAUDE.md shims, orphan pruning
```

**Edit the canonical file, never the mirror**; `sync:agents` overwrites it, so an edit in the wrong
place is discarded.

**Frontmatter is held to an allowlist** — the keys Claude Code documents, listed in
`.agents/cli.mjs` as `FRONTMATTER_KEYS` (`.agents/docs/DECISIONS.md #30`). Claude Code ignores any
other key with no error, so a misspelling silently undoes what the key was for:
`disable_model_invocation`, with underscores, leaves a skill the model can invoke. A key borrowed
from a *rules* file — `globs`, `alwaysApply` — does nothing at all. `sync:agents` will not repair
this one — it cannot guess what you meant, and claiming "in sync" over it would be a silent
success.

`name` and `description` are the only two both agents read; the rest are Claude Code's, and Codex
ignores them. So **keep the body carrying the instruction, never the frontmatter**: a playbook that
only works when `allowed-tools` or `disable-model-invocation` is respected is one Codex runs
differently. `new-project` is the example — its first line checks it is in the template, because
Codex will not honour the flag that keeps Claude Code from invoking it.

**A playbook names its arguments.** Claude Code counts `$N` from zero, so `$1` is the *second*
argument, and it substitutes one anywhere in the body. Declare `arguments: [name]` and write
`$name`; `guard` fails a bare `$N` (`.agents/docs/DECISIONS.md #37`).

`.claude/settings.json` allows the framework's own read-only and gate commands — `rule`, `guard`,
`verify` — without a prompt. The lookup protocol runs `rule` constantly, and each prompt is a
turn. It also runs two hooks: `check --only=agents --hook` after every edit, and
`check --only=plan --hook` when the agent stops. `--hook` turns a failure into exit 2, the one
code Claude Code shows the agent (`.agents/docs/DECISIONS.md #38`). A project's copy also denies
`Edit` on `.agents/` and the mirror. It is shared configuration, not generated: add to it freely.

**The platform is not the operator's problem.** Windows, macOS and Linux are all first-class, and
CI runs the whole suite plus a real scaffold on each — they fail differently, so a green result on
one proves little about the others.

Every check normalises `\` to `/` and CRLF to LF before comparing anything, `.gitattributes` pins
the working tree to LF, and `sync:agents` creates the mirrors itself — symlink where the platform
allows one, verified copy where it does not. A committed symlink cloned without symlink support
arrives as a plain text file; the guard names that and the sync repairs it. **Nobody runs
`ln -s`.**

There is exactly **one** `process.platform` branch in the framework, in the scaffolder: on Windows
`npm` and `npx` are `.cmd` shims that Node refuses to spawn directly since the CVE-2024-27980 fix.
Everything else is written so the platform never comes up. If you find yourself adding a second
branch, the check is probably comparing something it should have normalised first.

## 5. Branches, commits, PRs

A branch is a short kebab-case slug — no ticket prefix, there is no tracker to prefix from. A
phase branches off `main` and merges back once its steps are done; a step under an in-flight phase
branches off the phase branch. The two-tier shape exists so a phase lands as one reviewable thing;
a typo does not need the dance. Delete a branch once merged.

Commits are `<area>: <imperative, short>` — `api: add workspace list query`.

**A PR description is three lines:** what shipped · what was verified, named (`npm run verify`, a
manual check, a screenshot) · anything a reviewer needs that the diff does not show. Never skip
it; the description is the record, the title is not.

If a step turns out blocked mid-work, say so on the branch. Do not leave it silently half-done —
that is the silent-success defect applied to your own work. The `AGENTS.md` indexes are part of
the diff that changed the code, not a follow-up PR.

## 6. Updating the framework in a project already using it

The framework improves after your project started. You do not restart — you copy the new
`.agents/` in, because that is all the framework is.

```sh
npm run update:framework -- ../ai-development  # path or git URL. Remembered after the first time
npm run verify                                # the guards are the migration
git diff                                      # review, then commit — or throw it away
```

**Why it is safe, in the order that matters:** it refuses a dirty tree, so the diff is the update
and nothing else · it works on a `framework-update-<version>` branch (`--no-branch` to stay put) ·
**it writes only under `.agents/`**, so no update can break your code by touching it · it commits
nothing · it prints the one line that undoes it, including the files it *added*, which
`git checkout .` alone leaves behind.

`docs/` is mirrored, extras deleted. `skills/` cannot be — your own playbooks live there too — so
same-named ones are replaced, yours are never touched, and `version.json` records which playbooks
the framework shipped so only those are removed when one is dropped upstream. The framework's
decisions are in `docs/` beside the rulebook, so they are mirrored with it; your project's are
`docs/DECISIONS.md` at the root, which no update opens.

**How a project adapts is mostly by failing.** A changed rule arrives as a `npm run verify`
failure naming the file and the section. What a guard cannot see — a convention that changed
meaning, a rename with no checkable trace — is in `.agents/UPGRADING.md`, newest first, and the
updater prints every entry above the version you were on. Fix them on the update branch, so the
bump and the code it required arrive as one reviewable thing.

**Never edit `.agents/` in a project** to make an update fit — the next update overwrites it
silently. Fix it in the framework and release it (§7).

## 7. Releasing an improvement, on the framework side

1. Make the change in the framework repository. `npm run verify`.
2. Bump `version` in `.agents/version.json`. Any scheme; it is compared as a label, not a range.
3. Add an entry at the **top** of `.agents/UPGRADING.md` — `## <version> — <date>` and what a
   project must **do**. "Nothing — `npm run verify` covers it" is the common and correct answer.
   Anything outside `.agents/` — a file to delete, a root file to change — is never correct to
   leave out: `update` cannot touch it, so the note is the only way a project hears of it. The
   framework's tests fail if the newest entry and `version.json` disagree, or if `version.json`'s
   `skills` is not exactly what `.agents/skills/` ships.
4. Commit. Projects pick it up with `npm run update:framework`.

A change that needs no `UPGRADING.md` entry and no version bump is a change no project can tell
happened. That is fine for a typo and wrong for a rule.
