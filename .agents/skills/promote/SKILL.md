---
name: promote
description: Move a component, hook or data layer from a feature into shared/, rewriting every importer and both index rows. Use when a second feature needs something that lives inside one.
argument-hint: [path-to-thing]
arguments: [path]
---

# promote

Enforces `01 §4` — the promotion rule. This is the single most common cause of
a duplicated component, because doing it by hand is tedious and copying is not.

**Input:** `$path` — the path to the component, hook or api group to promote.

## Steps

1. **Confirm the second use is real.** Promotion is triggered by an actual second consumer, not
   by a suspicion there will be one. If there is no second consumer yet, stop — do not
   pre-build the abstraction.
2. **Decide what moves.** A component's whole folder moves. A data layer moves as a *group*:
   `api/*.{dto,mapper,api}.ts` + `hooks/use*.ts` + `types/*.types.ts` together. Splitting the
   group leaves a feature importing half of a thing from `shared/` and half from itself.
3. **Move the files** to `shared/components/<Name>/`, `shared/hooks/`, `shared/api/`,
   `shared/types/` — a component gets a folder, a hook or util is one file.
4. **Rewrite every importer.** Grep for the old path across the repo. Nothing may still point at
   `@/features/<a>/...` for the moved thing.
5. **Check what the moved code imports.** `shared/` may not import a feature. If the thing you
   moved reaches back into its old feature, that dependency has to become a prop or a slot —
   this is the step that actually generalizes it, and skipping it just moves the violation.
6. **Both index rows, in this change:**
   - delete the row from `features/<a>/AGENTS.md`
   - add a row to `shared/AGENTS.md` with all four columns, and write `Replaces` as a
     prohibition
   - in the feature's index, say *why* it moved under a `## What moved to shared/` heading. The
     reason is what stops someone moving it back.
7. Re-run the guards.

## Done when

`npm run verify` passes, a grep for the old import path returns nothing, and both features import
it from `shared/`.
