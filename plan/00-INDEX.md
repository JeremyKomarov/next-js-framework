# Plan

The table of contents. **Status only — never content.** Every detail lives in the phase file.

`npm run guard` fails if this table and the files in `plan/` disagree.

| # | Phase | Status | File |
|---|---|---|---|
| 01 | Foundation | not started | [01-foundation.md](01-foundation.md) |

**Now:** 01 · **Next:** —

The step inside that phase, and how it is going, live in [`NOW.md`](NOW.md) — this line stays
phase-level. `guard` fails if the two disagree.

Statuses are exactly: `not started`, `in progress`, `done`.

Add a phase with the `new-phase` playbook — it writes the file and this row together.
How to size one: `node .agents/cli.mjs rule 05 1`.
