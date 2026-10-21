# The framework — working guide

**What this is:** the source of a Next.js project template for coding agents. The product is
`.agents/` — the rulebook, the playbooks, the CLI and its guards, the kit — plus `bin/create.mjs`,
which scaffolds a project from it. There is no application here.

**This is not a project's guide.** A project's root guide is `.agents/templates/root-guide.md`,
which the scaffolder copies to the project's `AGENTS.md`. Its rules — "never edit `.agents/`",
mark the step in `plan/NOW.md` — are for projects. Here, `.agents/` is the thing you edit.

## What lives where

| Path | What | Reaches a project as |
|---|---|---|
| `.agents/docs/` | the rulebook — five files, fetched by section | itself |
| `.agents/skills/` | the playbooks; `.claude/skills` is a symlink to it | itself |
| `.agents/cli.mjs` | `rule`, `check` (the four guards), `sync`, `update`, `hooks` | itself |
| `.agents/cli.test.mjs` | the guard's own tests | never — the scaffolder deletes it, `update` skips it |
| `.agents/kit/` | eslint, tsconfig, vitest, the registry test, the pre-commit hook, the CI workflow | copied to the root and `.github/` |
| `.agents/templates/` | the shapes the playbooks copy from, and `root-guide.md` | itself |
| `.agents/version.json`, `UPGRADING.md` | the release label, and what a project must do on update | itself |
| `.agents/docs/DECISIONS.md` | the framework's decisions, numbered and append-only | itself, mirrored with the rulebook |
| `bin/create.mjs` | the scaffolder | never |
| `bin/check-templates.mjs` | runs the code templates through an installed scaffold's tsc, eslint and styles guard | never |
| `bin/check-lint.mjs` | feeds every lint zone imports it must refuse and allow, inside an installed scaffold | never |
| `docs/`, `plan/` | seeds: an empty decisions record and the glossary, and the one prescribed phase | copied once, then the project's |
| `.github/workflows/verify.yml` | this repository's CI | never — a project gets `.agents/kit/ci/verify.yml` |

`plan/` here is the seed every project starts from, not a plan for the framework. Do not track
framework work in it — the guard checks it as a project would, and it must stay idle. The same goes
for `docs/DECISIONS.md`: it stays empty, and the framework's decisions go in
`.agents/docs/DECISIONS.md`. A test fails if either rule is broken.

## Changing the framework

- **Fetch the section, not the file**: `node .agents/cli.mjs rule`, then `rule NN N`.
- **A change to a guard, the scaffolder or a convention comes with an `.agents/docs/DECISIONS.md`
  entry.** Append the next number; to change your mind, supersede an entry — never edit one. Cite
  it as `.agents/docs/DECISIONS.md #N` — a bare `DECISIONS.md #N` fails the guard.
- **Never renumber a rulebook section** — every project's citations point at it. Add one instead;
  `05 §3a` is the shape.
- **Every guard is tested both ways** in `.agents/cli.test.mjs`: it fails on the break, and passes
  on a correct project. A check that fires on correct code gets deleted
  (`.agents/docs/DECISIONS.md #22`).
- **A skill added, changed or removed:** `npm run sync:agents`, and keep `skills` in
  `.agents/version.json` equal to what the framework ships — `update` removes from a project only
  the playbooks listed there.
- **Anything a project can notice is a release** (`05 §7`): bump `.agents/version.json` and add the
  matching entry at the top of `UPGRADING.md`. A test fails if the two disagree.
- **Three platforms.** Normalise paths and line endings before comparing anything, and add no
  second `process.platform` branch (`05 §4`).
- **No formatter.** Code is hand-wrapped at 100 columns and markdown tables are aligned by hand;
  `.prettierignore` keeps format-on-save from reflowing whole files.

## The gate

`npm run verify` here is `guard` plus the CLI's tests. CI runs it on Linux, macOS and Windows,
scaffolds a project on each and guards it, then on Linux installs a scaffold, runs *its*
`npm run verify` — the only proof the README's promise holds — runs the code templates through it,
and proves every lint zone both ways. A scaffolder, template or kit change is untested until that
has run; to run it locally:

```sh
node bin/create.mjs ../scaffold-check --yes --name="Scaffold Check"
(cd ../scaffold-check && npm run verify)
node bin/check-templates.mjs ../scaffold-check    # writes into it — keep the scaffold throwaway
node bin/check-lint.mjs ../scaffold-check         # writes probes, and puts everything back
```

A lint zone added or changed comes with probes in `bin/check-lint.mjs`, both ways — the same rule
as a guard and its tests. Bumping a dependency is an edit to the exact versions in
`bin/create.mjs`, proven by that job.

The CLI's checks need Node 22.2 (`NODE_MIN` in `.agents/cli.mjs`); a separate CI job proves that
on Node 20 they refuse with that message, and that `hooks` — the postinstall — still runs.
