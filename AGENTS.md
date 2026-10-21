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
| `bin/create.mjs` | the scaffolder | never |
| `docs/`, `plan/` | seeds: the decisions record, and the one prescribed phase | copied once, then the project's |
| `.github/workflows/verify.yml` | this repository's CI | never — a project gets `.agents/kit/ci/verify.yml` |

`plan/` here is the seed every project starts from, not a plan for the framework. Do not track
framework work in it — the guard checks it as a project would, and it must stay idle.

## Changing the framework

- **Fetch the section, not the file**: `node .agents/cli.mjs rule`, then `rule NN N`.
- **A change to a guard, the scaffolder or a convention comes with a `docs/DECISIONS.md` entry.**
  Append the next number; to change your mind, supersede an entry — never edit one.
- **Never renumber a rulebook section** — every project's citations point at it. Add one instead;
  `05 §3a` is the shape.
- **Every guard is tested both ways** in `.agents/cli.test.mjs`: it fails on the break, and passes
  on a correct project. A check that fires on correct code gets deleted (`DECISIONS.md #22`).
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
scaffolds a project on each and guards it, then on Linux installs a scaffold and runs *its*
`npm run verify` — the only proof the README's promise holds. A scaffolder change is untested
until that has run; to run it locally:

```sh
node bin/create.mjs ../scaffold-check --yes --name="Scaffold Check"
cd ../scaffold-check && npm run verify
```
