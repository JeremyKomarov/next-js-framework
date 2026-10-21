---
name: new-project
description: Start a project from this framework template - one command scaffolds the app, installs the kit and wires Claude Code and Codex. Only in the template, before a project exists; never in a scaffolded project.
disable-model-invocation: true
---

# new-project

**First, check `bin/create.mjs` exists.** If it does not, this is already a scaffolded project:
stop and say so. Codex does not honour `disable-model-invocation`, so this line is what keeps it
from running here by mistake.

One command. It asks three questions and leaves a repository where `npm run dev` and
`npm run verify` both work.

From a clone of the template:

```sh
node bin/create.mjs my-app      # into a new directory
node bin/create.mjs .           # in place, in this clone
```

`npm run create -- .` does the same thing.

Non-interactive: `--yes --name="My App" --description="..." --db`.

It runs `create-next-app` (TypeScript, `src/`, App Router, no Tailwind, no ESLint — the kit's
config replaces it), installs the kit and the `verify` chain, writes the `shared/`, `core/` and
`store/` indexes, fills `AGENTS.md`, wires Claude Code and Codex, and replaces the framework's
README with your project's.

## Then, in this order

1. **`git init && npm run hooks`.** There is no repository for `npm install`'s `postinstall` to
   wire the pre-commit plan check into until now — this points git at
   `.agents/kit/hooks` so step 2 below is actually enforced per commit, not just at `npm run
verify` (05-WORKFLOW.md §3).
2. **`plan/01-foundation.md`** is the one phase the framework prescribes, and it is the work. Mark
   `01.1` `[~]`, set the phase to `in progress` in the file **and** in `plan/00-INDEX.md`, and
   write `plan/NOW.md`'s **Step**, **Since** and **State** — `npm run guard` fails on any of those
   four disagreeing (`05 §2`).
3. **Finish filling `AGENTS.md`.** The CLI fills the name, the description and an honest status
   table; the remaining `<ANGLE BRACKET>` placeholders are judgement — what is next, and what must
   not be touched.
4. **`docs/GLOSSARY.md`** — one entry per project term that does not mean what it looks like.
   Leave it near-empty rather than padding it.
5. **This project's UI kit, before the first feature screen** (`02 §6`) — step 01.9. Run the
   `plan-kit` playbook: it picks the primitives from the screens this project will actually have,
   records what it left out, and plans them as a phase. There is no fixed list.

## Done when

`npm run verify` passes, `git log` has one commit, and opening the project in a second agent gets
the same answer to "where do I put a new API call?"

## If you would rather do it by hand

Everything the CLI does is written down. The app comes from `create-next-app` into `next-app-tmp/`
and is moved up — it refuses a directory that already holds `AGENTS.md`. `.agents/kit/` holds the
three configs it copies to the root. `npm run sync:agents` does the agent wiring. Next 16 writes
its own `AGENTS.md` and re-adds it on every `next dev`, so the two are merged rather than one
winning.
