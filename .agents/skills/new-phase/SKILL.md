---
name: new-phase
description: Add a phase to the plan - the phase file and its index row together. Use when breaking down new work or extending the plan.
argument-hint: [phase-name]
arguments: [phase]
---

# new-phase

Enforces `.agents/docs/05-WORKFLOW.md`.

**Input:** `$phase` — a short phase name.

## Steps

1. Find the highest `NN` in `plan/` and use `NN+1`. **Never renumber existing phases** — numbers
   are addresses and may be cited from a commit message or a code comment.
2. Create `plan/<NN>-<slug>.md` from `.agents/templates/phase.md`.
3. Fill in:
   - **Goal** — one sentence: what is true at the end that is not true now.
   - **Depends on** — phase numbers, or "nothing".
   - **Steps** — `NN.1`, `NN.2`, each an imperative with an S/M/L size. Never points. All start
     `[ ]`; `[~]` and the strikethrough come later, as the work happens (`05 §2`).
   - **Done when** — something observable. "The function is implemented" is not a done
     condition; name the caller that reaches it and what it makes visible.
4. Add the row to `plan/00-INDEX.md` with status `not started`, and update the **Now / Next** line
   if this changes it. Leave `plan/NOW.md` alone — a new phase is not in flight.
5. **Size check:** if the phase file does not fit on one screen, it is two phases. Split it.

## Done when

`npm run guard` passes — index and files agree, the status is one of the three allowed
values, and `plan/NOW.md` still names whatever was actually in flight.
