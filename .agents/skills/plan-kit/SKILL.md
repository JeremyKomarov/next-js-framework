---
name: plan-kit
description: Decide which shared UI primitives this project needs, from what it actually is, and plan them as a phase before the first feature screen. Use once after phase 01, or when the product changes shape enough that the kit no longer fits.
---

# plan-kit

Enforces `02 §6`. There is no fixed kit — a marketing site, an admin tool and a mobile-first
consumer app need different primitives. This playbook is where the choice is made, once, on the
record.

## Steps

1. **Read what the project is.** The root `AGENTS.md` (**What this is**, **What is next**), every
   phase in `plan/`, and `docs/GLOSSARY.md`. If the screens the project will have are not written
   down anywhere, ask the user for the first three before going further — a kit chosen without
   knowing the screens is the fixed list again, guessed.
2. **List the first screens** in one line each, and under each the primitives it renders. A
   primitive names nothing from the domain (`02 §6`) — `Button`, `Field`, `Table`, never
   `InvoiceRow`.
3. **The kit is every primitive that appears on two or more of those screens**, plus any one of
   them that is hard to build twice consistently (a modal with focus trapping, a toast stack, the
   app shell). Everything else is built in `shared/` on first use, not now.

   Candidates, as a prompt and not a checklist: Button, Field (input, select, textarea,
   checkbox), Modal, Drawer, Alert, Toast, StatusBadge, Card, Table, Tabs, Tooltip, Avatar,
   EmptyState, Skeleton, Pagination, PageHeader, AppShell, Icon. **Icon** is in the kit if any
   screen shows an icon — it is the only way one is rendered (`02 §6a`).

4. **Write the decision into `src/shared/AGENTS.md`**, under a `## The kit for this project`
   heading above the components table:

   ```md
   ## The kit for this project

   Chosen with the `plan-kit` playbook on <date>, from these screens: <the list from step 2>.

   | Primitive | Needed by    | Variants it starts with             |
   | --------- | ------------ | ----------------------------------- |
   | Button    | every screen | primary, secondary, danger · sm, md |

   **Considered and left out:** Tabs — no screen has them yet. AppShell — single-page app.
   ```

   The left-out line matters as much as the table: it tells the next agent the thing was
   considered, so it does not "fix" the gap by building it.

5. **Plan it with the `new-phase` playbook** — one phase, one step per primitive, each sized S/M/L
   and built with `new-component`. Its done condition is the first feature screen rendered from
   these primitives alone. If the kit does not fit one phase on one screen (`05 §1`), split it.
6. Update **What is next** and the **Shared UI kit** row in the root `AGENTS.md` to name the
   phase.

## Done when

`src/shared/AGENTS.md` names the kit and what was left out, the phase exists, and
`npm run guard` passes.

## Later

A primitive the kit left out is still built in `shared/` on first use — the kit decides what is
built _ahead_ of need, not what is allowed in `shared/`. Add its row to the components table as
usual; the kit section stays as the record of what was decided up front. Re-run this playbook
only when the product changes shape.
