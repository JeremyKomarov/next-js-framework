# AI Development

A Next.js project template for coding agents. It ships **no application code** — it ships the
conventions, the enforcement that makes them stick, and twelve repeatable playbooks.

Clone it, then run the scaffolder from inside the clone:

```sh
node bin/create.mjs my-app     # into a new directory
node bin/create.mjs .          # in place, turning this clone into the project
```

Three questions, then a repository where `npm run dev` and `npm run verify` both work, with Claude
Code and Codex already wired to the same instructions. Nothing is published to npm and nothing is
installed globally — it is one script you can read (`.agents/docs/DECISIONS.md` #21). It needs
Node 22.2 or newer, and on an older one refuses before writing anything.

Works from **Claude Code and Codex** off one canonical set of files.

## The idea

An agent's expensive habit is rediscovery: globbing a tree and reading fifteen components to find
out whether one of them already does the thing. This template replaces that with four tiers,
cheapest first.

| Tier | Where | Loads | Answers | Costs |
|---|---|---|---|---|
| 1 | root `AGENTS.md` | always | *Where do I look?* | ~1,200 words |
| 2 | `<dir>/AGENTS.md` | when the agent touches that directory | *Does something here already do this?* | ~200 words |
| 3 | `npm run rule` | when tier 2 does not settle it | *Which rule covers this?* | ~290 words |
| 4 | `npm run rule -- 02 7` | when tier 1, 2 or 3 cites it | *What is the actual rule?* | ~200 words |

Tier 2 is the win, and it only works if those index tables stay true — so an index is part of the
change that altered the code, `npm run guard` proves the file exists, and the `sync-index` playbook
catches the rest.

## Rules are fetched, not read

Every rule is addressed as `<NN> §N`. `node .agents/cli.mjs rule 02 7` prints that section and
nothing else.

```sh
node .agents/cli.mjs rule            # every section, one line each — the map
node .agents/cli.mjs rule 02 7       # §7, and nothing else
node .agents/cli.mjs rule -q tokens  # which sections mention it
```

This is tier 4, and it is the difference between `02 §7` costing ~400 words and ~2,200. The
addresses were always section-level; until this existed, retrieval was file-level, so the
precision was decorative and every cited rule was paid for at five times its size. The map is
generated from the files, so it cannot go stale (`.agents/docs/DECISIONS.md` #20).

## The stack

Next.js App Router · SCSS Modules + BEM + CSS custom-property tokens · Zod · TanStack Query ·
Zustand · React Hook Form · Vitest.

**No database is prescribed** — `server/db/` is a boundary rule, and projects without a database
never create the folder. **No auth vendor is prescribed.** No Tailwind, no CSS-in-JS, no MSW.

## What you get

```
.agents/           THE FRAMEWORK — all of it. You read it; you do not edit it.
  docs/            the rulebook. Five files, 38 sections, fetched with `rule` — and DECISIONS.md,
                   why it is built this way: numbered, append-only, mirrored by every update
  skills/          the twelve playbooks. Read natively by Codex, mirrored for Claude Code.
  templates/       the component kit, the API chain, the index shapes, the phase shape
  kit/             eslint config, tsconfig, vitest config, the registry test, the pre-commit
                   hook, and ci/verify.yml — the project's CI workflow
  cli.mjs          the rule reader, the four checks, the skill sync, the framework updater
  cli.test.mjs     the guard, guarded. Framework-only; never copied to a project.
  version.json     which version this project is on
  UPGRADING.md     what each version asks of a project — newest first
bin/create.mjs     the scaffolder. Deleted from a project once it has run.
AGENTS.md          in this repository, the guide for working on the framework. A project's root
                   guide is .agents/templates/root-guide.md, which the scaffolder copies in.
.github/           in this repository, the framework's CI. A project gets its own from the kit.
.claude/           settings.json (the command allowlist) and the skills mirror
docs/              YOURS — your own DECISIONS.md (empty, numbered from 1) and GLOSSARY.md, seeded
plan/              YOURS — the table of contents, NOW.md, one small file per phase
.gitattributes     pins the working tree to LF. The checks compare files byte for byte; keep it.
```

## Enforcement

`npm run verify` = `typecheck` + `lint` + `guard` + `test`. One command, and nothing merges red:
every scaffolded project ships `.github/workflows/verify.yml`, which runs it on every push.

`npm run guard` is four checks in one script — plan, docs, styles, agents — and
`npm run guard -- --only=plan` runs one. **Every check exits 0 with a message when its target does
not exist yet**: a guard that fails on an empty project is a guard people delete.
`eslint.config.mjs` reads the feature list from disk, so the cross-feature import firewall grows
without anyone maintaining a list.

**The guard is itself tested.** `.agents/cli.test.mjs` builds a throwaway project, breaks exactly
one thing, and asserts the guard names it — in both directions, because a check that fires on
correct code gets disabled within a week.

**The templates are run, not just read.** The code in `.agents/templates/` is what an agent copies
verbatim, so CI writes it into an installed scaffold and type-checks and lints it there
(`bin/check-templates.mjs`). The import firewall is proven the same way: CI feeds every lint zone
imports it must refuse and imports it must allow (`bin/check-lint.mjs`). And a scaffold installs
exact versions, the set that job last proved.

**Windows, macOS and Linux are all first-class,** and CI runs the full suite plus a real scaffold
on each — and on Linux installs one and runs its own `npm run verify`, which is the only proof the
promise at the top of this page holds. They fail differently: Windows brings CRLF, absolute glob paths and symlinks that need
developer mode; macOS brings a case-insensitive filesystem, which the mirrors' byte-for-byte
comparison runs straight into; Linux is where all of that is invisible
(`.agents/docs/DECISIONS.md` #19, #22).

Deliberately *not* mechanized: naming, co-location, and "does `shared/` already have something
that does this". Those need judgement, and a guard that is wrong often enough gets ignored.

## Two agents

`AGENTS.md` is canonical, at the root and in every directory that owns things. Every
agent-specific file is a **pointer containing no rules of its own** — two copies of a rulebook
diverge inside a month.

| Agent | Reads `AGENTS.md` | Finds playbooks in | Runs one as | Needs wiring |
|---|---|---|---|---|
| **Codex** | natively | `.agents/skills/` | `$name` | none |
| **Claude Code** | via a `CLAUDE.md` per directory | `.claude/skills/` | `/name` | shims + mirror |

The last column is written by `npm run sync:agents`. **Nobody writes a shim, and nobody runs
`ln -s`** — which is what makes it work on Windows. The mirror is a symlink where the platform
allows one, so an edit propagates with no action; where symlinks are refused it becomes a verified
copy and `npm run guard` fails on a byte of drift.

The guard holds each `SKILL.md`'s frontmatter to the keys Claude Code documents. Claude Code
ignores any other key without a word, so a misspelled `disable_model_invocation` quietly leaves a
skill invocable — the allowlist turns that typo into a failure. Codex reads only `name` and `description`, so **the instruction lives in the body of a
`SKILL.md`, never in its frontmatter.** Why only these two: `.agents/docs/DECISIONS.md` #26.

## Updating a project already using it

The whole framework is one directory, so an update is a copy into it:

```sh
npm run update:framework -- ../ai-development
npm run verify      # the guards are the migration
```

It refuses a dirty tree, works on a branch, **writes only under `.agents/`** — so no update can
break your code by touching it — commits nothing, and prints the one line that undoes it. What a
project must change outside `.agents/` arrives as an `.agents/UPGRADING.md` note it prints.

## Adapting it

The opinions are written down with their reasons in
[`.agents/docs/DECISIONS.md`](.agents/docs/DECISIONS.md) — numbered and append-only. Disagreeing
is fine; do it by adding the next entry, superseding one, so the next person can see what changed
and why. Editing the reasoning out is how a convention becomes a superstition.

A project keeps its own record in `docs/DECISIONS.md`, numbered from 1. The two never share a
number, and every citation names which record it means (`.agents/docs/DECISIONS.md` #34).
