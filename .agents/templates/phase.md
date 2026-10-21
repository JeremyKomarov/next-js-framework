# Phase template

Copy into `plan/NN-<slug>.md`. The `new-phase` playbook writes this and its index row together.
Rules: `05 §1`.

---

# NN — <phase name>

**Goal:** one sentence. What is true at the end that is not true now.
**Depends on:** <phase numbers, or "nothing">
**Status:** not started | in progress | done

## Steps
`[ ]` not started · `[~]` in flight now (one, and `plan/NOW.md` names it) · `[x]` done, struck through.

**Status** above, this file's markers, the row in `00-INDEX.md` and `NOW.md` all say the same
thing, or `npm run guard` fails: `in progress` means exactly one `[~]`, and a `[~]` means
`in progress` (`05 §2`).

- [x] ~~NN.1 — <imperative> (S|M|L)~~
- [~] NN.2 — <imperative> (S|M|L)
- [ ] NN.3 — <imperative> (S|M|L)

## Done when
<Something observable. A screen shows it, a query returns it, a check fails without it.
"The function is implemented" is not a done condition — name the caller that reaches it.>

## Notes
<Decisions taken while working. Promote anything the next person would be surprised by
to docs/DECISIONS.md, and say here that you did.>
