---
name: new-component
description: Scaffold a component folder with its styles, class map and strings, and add its row to the directory index. Use when creating any new component in shared/ or a feature.
argument-hint: [ComponentName] [shared|feature-name]
arguments: [component, owner]
---

# new-component

Enforces `02 §1`–§3.

**Input:** `$component` — PascalCase component name. `$owner` — `shared`, or the feature that
owns it.

## Steps

1. **Reuse check first, and do not skip it.** Read the target directory's `AGENTS.md`, then
   `shared/AGENTS.md`. If something there already does this, or 80% of it, extend that instead
   and stop. If it is a *variant* of one of them — another tone, size, or state — add the value
   to that component's enum const and its modifier class map and stop; a near-copy is the bug
   this playbook exists to prevent (`02 §6`). If a *different* feature has
   something close, use the `promote` playbook rather than copying.
2. **Then decide `shared` or feature, whatever `$owner` says.** A primitive — button, field, card,
   modal, table, badge, toast, empty state — goes in `shared/` on first use, with its variants.
   Only something that names an entity or a workflow stays feature-local. Say which you chose and
   why in one line before scaffolding.
3. Create `<target>/components/$component/` from `.agents/templates/component.md`, renaming
   `SummaryCard` to `$component`.
   **Four different casings, and a blind find-and-replace gets them wrong** — the template uses a
   two-word name precisely so they are visibly distinct. For `$component = InvoiceRow`:

   | Template | Becomes | Used for |
   |---|---|---|
   | `SummaryCard` | `InvoiceRow` | filenames, the component, the `classMap()` label |
   | `summaryCardClasses` | `invoiceRowClasses` | the exported class map, keys, strings objects |
   | `SUMMARY_CARD_TONES` | `INVOICE_ROW_TONES` | consts and the namespace |
   | `summary-card` | `invoice-row` | every CSS class, inside the module only |

   Files:
   - `index.tsx`, `$component.module.scss`, `$component.classes.ts` — always
   - `$component.strings.ts` + `$component.keys.const.ts` — as soon as it renders any text
   - `$component.const.ts` — only if it has enum-like props
   - `$component.types.ts` — only if its props are worth naming separately
4. BEM inside the module, tokens only, no hex. **Responsive in the same file**, against the
   breakpoint scale in `02 §8` — fluid first, media query only where the
   layout actually changes. Check 360px, 768px and 1280px before you call it done.
5. **Add the row to `<target>/AGENTS.md`.** For `shared/`, fill all four columns — and write
   `Replaces` as a *prohibition*, not a description ("Never build a second X"), because that
   column is what stops the next agent building a duplicate.
6. **Keep it small.** Over ~150 lines, three distinct regions, more than ~6 props, or a boolean
   that changes what the thing *is* — split into `partials/`, or into two components. Both cases
   and their thresholds are the table in `02 §4`. Styles split with the markup.

## Done when

`npm run verify` passes — `guard` proves every class in the map exists in the stylesheet —
and the index row is in the same change as the component.
