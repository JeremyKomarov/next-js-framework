# Directory index templates

Every directory that owns things ships an `AGENTS.md`, updated in the same change that altered the
code. This is tier 2 of the lookup system — what lets an agent answer "does something here already
do this?" without reading the folder.

Each shape below uses a **different column set**, because each answers a different question. Copy
the one that matches the directory. Rules: `04 §3`,
`01 §4`.

---

## `features/<name>/AGENTS.md` — shape A, built

```md
# `<name>`

One paragraph: what this feature is, in plain language. Feature flag: `<name>`, enabled.

## Status

| Endpoint | Status | Source |
|---|---|---|
| `<name>.list` (GET) | Live, session-scoped. 401 without a session. | `app/api/<name>/route.ts` |
| `<name>.create` (POST) | Not built — returns 501. | — |

## Inventory

- `components/<Name>Screen` — the screen. What it composes and what state it owns.
- `components/<Name>Row` — presentational; takes a domain object, renders a row.
- `hooks/use<Name>.ts` — the only `useQuery` here.
- `hooks/useCreate<Name>.ts` — the only `useMutation`; invalidates `<name>.list`.
- `api/<name>.{dto,mapper,api}.ts` — the wire contract, the mapping, the fetch.
- `strings/<name>.strings.ts` — the `<name>` namespace.

## What moved to `shared/`

The data layer was promoted when a second feature needed it; this feature owns the screens.

## Next real work

The one concrete thing that would move this forward.
```

One `## Status` row per endpoint, stating what is real **right now**. "Live" and "not built" are
both honest; "in progress" is not a status, it is an excuse. Omit `## What moved to shared/` unless
something did — and when it did, say *why*, because the reason is the useful part.

## `features/<name>/AGENTS.md` — shape B, declared, not built

Not a placeholder. This is the honest state of a route that is in nav and flagged off.

```md
# `<name>`

**Status: not built yet — this folder holds only this document.**

What it will be, in two sentences. Feature flag: `<name>`; route: `/<name>`.

## Current behavior

Coming soon. The route is built with `featurePage(FEATURE_KEYS.<name>)` and renders the shared
disabled shell — not a 404, and not a half-working screen.

## Planned ownership

- The screens and state this feature will own.
- What it will deliberately not own.

## Next real work

The one question or dependency that unblocks it.
```

**`## Next real work` is mandatory in both.** A feature index without it is a document nobody will
ever act on.

---

## `shared/AGENTS.md`

```md
# `shared/` — the reuse layer

Check this file before building any component, hook, or util.
The rules: `node .agents/cli.mjs rule 02 5` (does one already exist?), `02 6` (does it go here?).

## Components

| Component | What it is | When to use | Replaces |
|---|---|---|---|
| `components/Button` | `Button` and `ButtonLink`; variants, sizes, loading and disabled built in. Exports `BUTTON_VARIANTS`, `BUTTON_SIZES`. | Every action or action-styled link. | Bespoke action styling. |
| `components/Field` | Labelled Input, Select, Textarea and Checkbox; sizes, helper text, error state, icons. Exports `FIELD_SIZES`. | Every data-entry control. | Raw form controls with feature-owned styling. |
| `components/Modal` | Portal-based, focus-trapped, sizes, full-screen under `sm`; plus a confirmation variant. Exports `MODAL_SIZES`. | Focused tasks and explicit confirmation. | Bespoke overlays and `window.confirm`. |
| `components/Alert` | Inline info / success / warning / critical with matching icon and role. Exports `ALERT_TONES`. | Persistent feedback next to what it concerns. | One-off warning banners. |
| `components/Toast` | Provider plus `useToast`; auto-dismiss, same four tones. Exports `TOAST_TONES`. | Brief, non-blocking outcome feedback. | Local notification stacks. |
| `components/StatusBadge` | Semantic pill. Exports `STATUS_TONES`. | Short statuses, plans, counts. | One-off chips. |
| `components/EmptyState` | Icon, title, body, action area. | Empty, unavailable, and selection-required states. | One-off centred placeholders. |
| `components/PageHeader` | Eyebrow, title, description, responsive action slot. | The top of every screen. | Repeated page-heading markup. |
| `components/Icon` | Wraps `lucide-react`, keyed. Exports `ICONS`; reference `ICONS.settings`, never `"settings"`. The only file that imports the library (`02 §6a`). | Navigation, actions, field chrome. | A direct `lucide-react` import anywhere else, hand-drawn `<svg>`, a second icon library. |
| `components/AppShell` | Sidebar, topbar, mobile drawer, collapse state. Splits into `partials/`. | Wraps every signed-in route. | Never build a second sidebar or top bar. |

## Hooks

| Hook | What it does | When to use |
|---|---|---|

## Utils

| Util | What it does | When to use |
|---|---|---|
| `utils/cn.ts` | Joins class references conditionally. | Every conditional `className`. |
| `utils/classMap.ts` | Wraps a class map so an undefined name throws in development. | Every `*.classes.ts`. |
| `utils/keysOf.ts` | Derives message keys from a strings object. | Every `*.keys.const.ts`. |

## Promotion rule

A component starts inside a feature. The moment a second feature needs something close,
generalize it here instead of copying it. Use the `promote` playbook.
```

That table is an **example** of a filled-in index, not a list to build. A project's kit is chosen
from its own screens by the `plan-kit` playbook (`02 §6`) and recorded above the components table
under `## The kit for this project`. Whatever it holds exists before the first feature screen does,
each component shipping its variants as exported consts and its own responsive behaviour (`02 §8`). A
feature never re-solves either.

The **`Replaces`** column is the anti-duplication rule in table form. Its cells are
*prohibitions*, not descriptions — "Never build a second sidebar", "a second icon library". That
column is why an agent stops instead of building a second one.

---

## `core/AGENTS.md`

```md
# `core/` — app-wide configuration, never UI

**Configuration only.** If it holds runtime state it does not belong here — global stores live in
`store/`, a sibling of `core/`. `core/` is what the app boots with; `store/` is what changes while
it runs.

| Path | What | Rule |
|---|---|---|
| `config/features.const.ts` | The feature registry: route + `enabled` per screen. | Reference a key as `FEATURE_KEYS.dashboard`, never `"dashboard"`. |
| `config/env.ts` | Validated environment. | The only file that may read a `NEXT_PUBLIC_*` variable — ESLint enforces it. |
| `constants/routes.const.ts` | Routes, derived from `FEATURES`. | Never restate a route here. |
| `constants/query-keys.const.ts` | TanStack Query keys. | Never an inline key. |
| `constants/storage-keys.const.ts` | Browser storage keys. | Never an inline `localStorage` key. |
| `api/api-error.ts` | `API_ERROR_CODES`, `API_ERROR_STATUS`, `ApiError`, `toApiError`. | The code picks the status. |
| `i18n/messages.ts` | Namespace → strings file. | The one file in `core/` allowed to import from `features/`. |
| `styles/tokens.scss` | Every design token. | The only file that may contain a hex colour. |
```

---

## `store/AGENTS.md`

```md
# `store/` — global client state

Only what more than one feature reads. Split from `core/` because `core/` is boot-time
configuration and this is what changes while the app runs.

| Store | Holds | Read it through |
|---|---|---|
| `active-workspace.store.ts` | The selected workspace id. | `shared/hooks/useActiveWorkspace` — **not** the store directly. |

## What does not belong here

- **Server state.** That is TanStack Query's.
- **Feature-local state.** `useState` first; a feature's own `store/` if it must be shared.
- **The signed-in user.** Resolved on the server, passed down as a prop.
```

The **`Read it through`** column names the approved accessor and forbids the raw one. The accessor
is where the "nothing selected yet" fallback lives, so every caller gets the same answer
(`01 §7`).

---

## Every index

Ends the same way, and means it:

```md
## Keep this file current

Adding, changing, or removing anything in this folder updates this file in the same change.
```

Each directory index needs its `CLAUDE.md` shim beside it — one line, `@AGENTS.md`. `npm run
guard` checks for it.
