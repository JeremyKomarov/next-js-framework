# Components — anatomy, reuse, styling, strings

## 1. The component folder

A component is a folder. Even a one-file component is a folder, because it will grow one.

```
components/StatusBadge/
  index.tsx                    the component
  StatusBadge.module.scss      its styles, BEM inside (§7)
  StatusBadge.classes.ts       its class map — the only importer of the module
  StatusBadge.strings.ts       its user-facing text (§9)
  StatusBadge.keys.const.ts    its namespace + keysOf(strings)
  StatusBadge.const.ts         its enum-like prop values, where it has any
  StatusBadge.types.ts         its props, where they are worth naming
```

The last three are added when needed. Import a component; **never import another component's
classes, styles or module.** Full working shape: `.agents/templates/component.md`.

## 2. No magic classes

A CSS Module's type is `{ readonly [key: string]: string }`, so `styles["typo__here"]`
type-checks, evaluates to `undefined`, and renders nothing. The class map is therefore mandatory:

```ts
export const statusBadgeClasses = classMap("StatusBadge", {
  root: styles["status-badge"],
  tone: {
    neutral: styles["status-badge--neutral"],
    warning: styles["status-badge--warning"],
  },
});
```

`classMap()` throws in development naming the key; `npm run guard` makes the same check
statically. A modifier that deliberately has no rule is written `NO_CLASS`, so "intentionally
nothing" and "misspelled" stop looking identical.

JSX reads `className={statusBadgeClasses.root}` — never a literal, never `styles[...]`, and
**never a class name assembled at runtime**. A modifier set is an enumerated record, because an
interpolated `` `badge--${tone}` `` silently resolves to nothing the moment a modifier is missing.
Compose conditionally with `cn()`.

## 3. No magic strings

Every literal that means something structural — a route, a query key, an endpoint, a storage key,
an enum-like string — lives in a `*.const.ts` and is imported. **A component's enum-like prop
values are constants it exports.** The object is the source of truth; the union is derived:

```ts
export const STATUS_TONES = { neutral: "neutral", warning: "warning" } as const;
export type StatusTone = (typeof STATUS_TONES)[keyof typeof STATUS_TONES];
```

```tsx
<StatusBadge tone={STATUS_TONES.warning} />
```

Adding a tone is one edit, and the type follows.

## 4. Small by default, and how to split

One component does one job. The budget, not a suggestion:

| When | Then |
|---|---|
| `index.tsx` passes ~150 lines | Split into `partials/` |
| It renders three distinct regions | Split into `partials/` |
| More than ~6 props, or a prop that only makes sense with another | Two components |
| A boolean that changes what the thing *is* (`isModal`, `asTable`) | Two components. Booleans tune; they do not transform. |
| An `&&` chain choosing between two whole layouts | Two components. The caller picks. |

A partial lives in `partials/<Part>/` **inside its parent's folder**, is a component in every
other respect, and is never imported from anywhere but its parent.

- **Split the styles with the markup.** A partial owns the rules for what it renders, including
  its media queries. A parent modifier that styled children by descendant selector becomes a prop
  plus the partial's own modifier class.
- **Shared chrome becomes a partial, not duplicated CSS.**
- **The parent keeps only layout** — its module drops to grid and column rules, and its
  `index.tsx` reads as a table of contents for the screen.
- **Data comes from the shared query hook, not prop chains.** Sibling partials needing the same
  server data each call the same hook: one cache entry, one request.

## 5. Before you create anything

1. Does this directory's `AGENTS.md` already list something that does this, or 80% of it?
   Use it or extend it.
2. Does `shared/AGENTS.md`, or a sibling feature? **Promote** it — do not copy it.
3. Is it a variant of something that exists? Then it is a modifier, not a new folder. §6
4. Component, hook, or API call? Put it in the matching subfolder — never a `misc/`.
5. Is every literal that means something a `const`? §3
6. Is it small (§4) and responsive at all three widths (§8)?
7. Does this change a directory's shape? **Update that `AGENTS.md` in this change.**

Steps 1, 2, 3 and 7 need judgement and are not mechanized. Everything else is checked by
`npm run verify`.

## 6. Shared-first, and variants instead of near-copies

**Would a second screen render this?** If yes, build it in `shared/` now, with its variants. The
test is what the component talks about, not where you needed it first:

- **A primitive** — button, field, card, modal, table, badge, toast, empty state, page header. It
  names nothing from the domain. `shared/`, on first use, no exceptions.
- **Domain-shaped** — it names an entity or a workflow (`InvoiceRow`, `OnboardingStep`).
  Feature-local until a second feature wants it, then `promote` (01 §4). Never copy.

**A variant is not a new component.** `CardCompact` beside `Card`, a second red `Button`, a
`SmallModal` — each is a modifier someone declined to add. Extend the existing enum const (§3) and
its modifier map (§2): the union follows, every caller keeps working, and there is one place to
fix. A near-copy gives you two.

So every shared component carries its variation surface as exported consts — `*_VARIANTS`,
`*_TONES`, `*_SIZES` — with loading, disabled, error and empty built in rather than left to
callers. `<Button variant={BUTTON_VARIANTS.danger} />`, never a bespoke red button.

**A project starts with its kit, before its first feature screen** — the primitives its first
screens share, each with its variants and its responsive behaviour. The kit is chosen per project,
not prescribed: an admin tool needs a `Table` and an `AppShell`, a landing page needs neither. The
`plan-kit` playbook makes the choice from the planned screens and records it, with what was left
out, in `shared/AGENTS.md` (`.agents/docs/DECISIONS.md #27`). A project built feature-first grows
five different buttons and finds out in month two.

## 6a. Icons — one library, one wrapper

Icons come from `lucide-react`, and `shared/components/Icon` is the only file that imports it
(`.agents/docs/DECISIONS.md #23`). Nowhere else writes `<svg>` markup or imports the library
directly — ESLint's `no-restricted-imports` fails a direct import from anywhere else, the same
shape as the `server/db/` client rule in `01 §8`.

```
components/Icon/
  index.tsx              <Icon name={ICONS.settings} size="md" />
  Icon.const.ts           ICONS — the keyed map, and ICON_SIZES
  Icon.types.ts
```

```ts
// Icon.const.ts — the map IS the source of truth; the union of valid names is derived.
import { Settings, ChevronDown, Trash2 } from "lucide-react";

export const ICONS = {
  settings: Settings,
  chevronDown: ChevronDown,
  trash: Trash2,
} as const;

export const ICON_SIZES = { sm: 16, md: 20, lg: 24 } as const;
```

```tsx
// index.tsx — every caller renders through this, never lucide-react directly.
import { ICONS, ICON_SIZES } from "./Icon.const";
import type { IconProps } from "./Icon.types";

export function Icon({ name, size = "md", className }: IconProps) {
  const Glyph = ICONS[name];
  return <Glyph size={ICON_SIZES[size]} className={className} aria-hidden />;
}
```

**Add to the map, never reach past it.** A screen that needs an icon `lucide-react` does not have
is a one-line addition to `ICONS`, not a reason to import the library directly "just this once" —
the second entry point is exactly how a project ends up with two icon sets that stop matching.
Decorative icons stay `aria-hidden`; an icon that is the only content of a control (an icon-only
button) needs an accessible name on the control itself, not on the glyph.

## 7. Styling — tokens and BEM

`core/styles/tokens.scss` is the single source for colour, typography, spacing, radius, elevation
and motion, imported **once** in the root layout. Everything else is a `*.module.scss` beside its
component, consuming `var(--token)` and nothing else. No SCSS variables, no mixins.

**Copy `.agents/templates/tokens.scss` in whole for phase 01.2** — it is a complete, real default:
every group below filled with values chosen for contrast and consistency, not a shape to invent
values for under time pressure (`.agents/docs/DECISIONS.md #25`). Re-hue the brand ramp to match
your product; leave the neutral ramp, the semantic quads and the scales alone unless you have a
specific reason — they are already built to sit together.

The framework specifies the **groups**; the template's values are the default, meant to be kept:

| Group | Shape |
|---|---|
| Brand / neutral ramps | `--brand-950` … `--brand-50`, `--neutral-950` … `--neutral-50` |
| Surfaces | `--surface-page`, `--surface-card`, `--surface-soft`, `--surface-brand` |
| Text | `--text-primary`, `--text-secondary`, `--text-muted`, `--text-on-brand` |
| Borders | `--border-subtle`, `--border-strong`, `--focus-ring` |
| Semantic status | a quad each for positive / warning / critical / info: `--<name>-text`, `--<name>-strong`, `--<name>-surface`, `--<name>-border` |
| Typography | `--font-sans`, `--text-xs` … `--text-3xl` |
| Spacing | `--space-1` (4px) … `--space-16` (64px) |
| Radius & shadow | `--radius-xs` … `--radius-pill`, `--shadow-xs` … `--shadow-md` |
| Layout | `--sidebar-width`, `--topbar-height`, `--control-height-sm/md/lg`, `--content-max-width` |
| Z-layers | `--layer-dropdown` … `--layer-toast`, named and ordered in one place |
| Motion | `--ease-standard/spring/emphasized`, `--duration-fast/normal/slow` |

The file ends with the reset, base element rules, and a `prefers-reduced-motion` block.

**No hardcoded colour outside `tokens.scss`** — `npm run guard` fails on any found elsewhere: a
hex, a colour function such as `rgb()` or `oklch()` (unless it wraps a `var()`), or a named colour
like `white` as a colour property's value. `transparent` and `currentColor` are not literals.
Semantic colours carry meaning and are never decorative alternatives to the brand ramp.

**BEM inside the module:** one block per component, elements `__`, modifiers `--`. Modules already
scope names; BEM is here for readability.

```scss
.company-list__row {
  display: grid;
  gap: var(--space-4);
  border-bottom: 1px solid var(--border-subtle);

  &:last-child { border-bottom: 0; }
  &--empty { color: var(--text-muted); }
}
```

The guard resolves `&` at any depth when it checks the class map — `&__el`, `&--mod`, an
element's own `&--mod`, `&-suffix` — so nested is fine and preferred. Component-local `@keyframes`
live in the module.

**Interaction:** every interactive element has a visible `--focus-ring` focus state; controls keep
a 44px touch target on coarse pointers and a 16px font size so mobile browsers do not zoom; hover
lift never exceeds 2px; motion drops to near-zero under `prefers-reduced-motion`, and **no
workflow relies on animation alone to communicate state.**

## 8. Responsive, on the first commit

A component is built responsive or it is not built. "Made responsive later" is a second pass over
markup written assuming a width, and it costs more than the first pass did.

Six breakpoints, `rem`, and nothing between them — a custom property cannot be used in a media
query condition, so these are written literally:

| xs | sm | md | lg | xl | 2xl |
|---|---|---|---|---|---|
| `30rem` | `36rem` | `42rem` | `52rem` | `64rem` | `76rem` |
| small phone | phone | large phone | tablet | laptop — sidebar collapses | desktop |

Use the nearest value; adding one is an edit to this table.

- **Fluid first, breakpoint second.** `minmax()`, `repeat(auto-fit, …)`, `clamp()`, `%` and `fr`
  handle most layouts with no media query. Reach for a breakpoint when the layout has to *change*,
  not to resize it.
- **No fixed `px` width on anything holding content.** `max-width` plus `width: 100%`.
- **A component adapts to the width it is given; the parent owns the layout breakpoint.**
- **Touch is its own query.** `(pointer: coarse)` earns the 44px target — a narrow viewport is not
  the same question as a finger.
- **Overflow is a decision.** A wide table or code block scrolls inside its own container; the
  page body never scrolls sideways.
- **Responsive behaviour belongs to the shared primitive** (§6). A feature re-solving the sidebar
  collapse is a duplicate (01 §4).

Breakpoint blocks go at the end of the module. When a component splits into partials, its media
queries split with it. **Done means checked at 360px, 768px and 1280px** — not "should be fine".

## 9. Strings — English now, structured for more later

Every user-facing string goes through the translation function from day one. Never a hardcoded
string in JSX; adding a second locale is then a parallel set of files, not a find-and-replace.

| Scope | Lives in |
|---|---|
| One component's text | `<Component>.strings.ts`, beside its `index.tsx` |
| Shared by 2+ components in a feature | `features/<name>/strings/<name>.strings.ts` |
| Shared across features | the `core/` file that owns the concept, or `core/i18n/common.strings.ts` |

**Keys are derived, never typed.** Each strings file has a `*.keys.const.ts` beside it:

```ts
export const QUEUE_NAMESPACE = "queue";
export const queueKeys = keysOf(queueStrings);
// → { eyebrow: "eyebrow", steps: { ideas: { label: "steps.ideas.label" } } }
```

```tsx
const t = useTranslations(QUEUE_NAMESPACE);
t(queueKeys.steps[step.key].label);   // never `steps.${step.key}.label`
```

Adding a string publishes its key; renaming one is a type error at every call site.

**The setup is three files.** `core/i18n/messages.ts` maps each namespace to the strings file that
owns it — the one file allowed to reach from `core/` into `features/`, and nothing is authored
there. `core/i18n/request.ts` resolves the active locale and dictionary. `core/i18n/global.d.ts`
augments the config with `typeof messages`, so `t()` keys are checked by `tsc`. `next-intl` is the
default binding and is one import deep; swapping it touches these three files and nothing else.

Four that are easy to get wrong:

- **Counts are ICU, not concatenation.** `"{count, plural, =1 {# item is} other {# items are}}
  ready."` The next language's plural rules are not English's.
- **Dates and numbers go through the formatter hook**, never a hand-built `Intl.DateTimeFormat`.
- **Servers return codes, not sentences** (03 §2). The sentence is looked up from the code.
- **An untrusted value never reaches `t()`.** Narrow it to a known key first, or the person
  already stuck sees `MISSING_MESSAGE` on top of it.

## 10. Traps that have already cost time

*(Empty in the template.)*
