# The framework

Five small files. **Fetch the section you need; do not read the file.**

```sh
node .agents/cli.mjs rule            # every section, one line each
node .agents/cli.mjs rule 02 7       # §7, and nothing else
node .agents/cli.mjs rule -q mocks   # which sections mention it
```

The map is generated from the files, so it cannot go stale — and it is cheaper than this page.
**Renumbering a section is a breaking change across the repository**, and `npm run guard` says so.

## Which section answers which question

| I need to know… | Fetch |
|---|---|
| Where does this file go? What may import what? | `rule 01 1` |
| Where does this piece of state live? | `rule 01 7` |
| How do I write a Route Handler? Where does the database go? | `rule 01 8` |
| How do I build a component? | `rule 02 1` |
| Does something already do this? Is it a variant? | `rule 02 5`, `rule 02 6` |
| What token do I use? What breakpoint? | `rule 02 7`, `rule 02 8` |
| Where does this user-facing text go? | `rule 02 9` |
| **How do I add an API call?** | `rule 03 1` |
| How do errors travel? How do mocks work? How do I build a form? | `rule 03 2`, `03 3`, `03 4` |
| How do I add a screen? How do feature flags work? | `rule 04 1`, `rule 04 2` |
| How do I break work into phases? Where is the work right now? | `rule 05 1`, `rule 05 2` |
| What is actually checked, and by what? | `rule 05 3` |
| How are Claude Code and Codex wired? Why is my skill invisible? | `rule 05 4` |
| How do I branch, commit, update the framework? | `rule 05 5`, `rule 05 6` |
| Why is it done this way and not the obvious way? | [`.agents/docs/DECISIONS.md`](DECISIONS.md) — the framework's |
| What has this project decided? | [`docs/DECISIONS.md`](../../docs/DECISIONS.md) — yours |
| What does this word mean here? | [`docs/GLOSSARY.md`](../../docs/GLOSSARY.md) |

## The three rules that outrank convenience

**1. No duplication.** Before creating any component, hook, util, type or API call, read the
`AGENTS.md` of the directory you are about to write in, then `shared/AGENTS.md`. A second
near-identical `Card` is a bug, and another size of one is a variant, not a component. `02 §5`,
`02 §6`

**2. No silent success.** Anything that reports success without doing the work is a defect, not a
placeholder — a stub handler, a mock nobody can see, a screen that looks live and is not. Every
other oddity here exists to serve this one. `03 §3`, `04 §2`

**3. The index is part of the change.** Adding, moving or removing anything updates that
directory's `AGENTS.md` in the same commit — not as a follow-up. The indexes are how the next
agent finds anything without reading every file.

## The lookup system, and why it is shaped like this

An agent's expensive habit is rediscovery: globbing a tree and reading fifteen components to find
out whether one already does the thing. Four tiers replace that, cheapest first.

| Tier | Where | Loads | Answers | Costs |
|---|---|---|---|---|
| 1 | root `AGENTS.md` | always | *Where do I look?* | ~1,200 words |
| 2 | `<dir>/AGENTS.md` | when an agent touches that directory | *Does something here already do this?* | ~200 words |
| 3 | `rule` with no arguments | when tier 2 does not settle it | *Which rule covers this?* | ~290 words |
| 4 | `rule NN N` | when tier 1, 2 or 3 cites it | *What is the actual rule?* | ~200 words |

Tier 2 is the win, and it only works if those index tables stay true — so an index is part of the
change that altered the code, `guard` proves the file exists, and the `sync-index` playbook catches
the rest.

Tier 4 is what stops a citation costing more than the rule it names. `02 §7` is ~400 words;
`02-COMPONENTS.md` is ~2,200, so opening the file to answer one question wastes four fifths of the
read, every time. The addresses were always section-level — until `rule` existed, retrieval was
not. `05 §3a`

## Yours, or the framework's

**`.agents/` is the framework. Everything else is yours.** One folder, one sentence, no per-file
judgement.

| Path | Whose |
|---|---|
| `.agents/docs/` | framework — this rulebook. Fetch when cited; never renumber a section. |
| `.agents/skills/` | framework — the playbooks. Add your own beside them, then `npm run sync:agents`. |
| `.agents/cli.mjs` | framework — the rule reader, the guards, the sync and the updater. Changing one changes a rule, so it comes with an `.agents/docs/DECISIONS.md` entry. |
| `.agents/kit/`, `.agents/templates/` | framework — installed and copied from by the playbooks. |
| `.agents/version.json`, `UPGRADING.md` | framework — which version you are on, and what an update asks of you. |
| `.agents/docs/DECISIONS.md` | framework — why it is built this way. Numbered, append-only, replaced by every update; cite as `.agents/docs/DECISIONS.md #N`. |
| `src/` | yours — every line of app code. |
| `docs/` | yours — `DECISIONS.md` (yours, numbered from 1; cite as `docs/DECISIONS.md #N`) and `GLOSSARY.md` arrive seeded; append. |
| `plan/` | yours — your phases. The shape is prescribed, the content never is. |
| root configs, `AGENTS.md`, `CLAUDE.md`, `.gitattributes` | shared — pinned to the root by tool convention. |
| `.claude/skills`, every `CLAUDE.md` | generated — written by `sync:agents`, holding no rule of their own. |
| `.claude/settings.json` | shared — seeded with the framework's command allowlist; add your own. |

Nothing you write goes inside `.agents/` except a new playbook. Nothing the framework owns lives
outside it except the root files that are not allowed to move, and the generated agent wiring.

**Never edit `.agents/` in a project.** The next `npm run update:framework` overwrites it,
silently. Fix it in the framework and release it — `05 §7`.

## The commands

```sh
npm run dev                 # the app
npm run verify              # typecheck + lint + guard + test. The gate.
npm run rule -- 02 7        # one section of the rulebook
npm run guard               # the four checks alone
npm run sync:agents         # after adding, changing or deleting a skill
npm run update:framework    # pull a newer .agents/ in, on a branch
```

`npm run` needs `--` before arguments; `node .agents/cli.mjs rule 02 7` does not, which is why the
short form is the one written into every citation.
