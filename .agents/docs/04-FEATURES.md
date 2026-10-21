# Features — the registry, the flags, and the index contract

## 1. The registry is the single source of truth

`core/config/features.const.ts` holds every screen in the app: its route and an `enabled` boolean.
Nothing else decides whether a feature is on.

```ts
export const FEATURE_KEYS = { dashboard: "dashboard", workspaces: "workspaces" } as const;
export type FeatureKey = (typeof FEATURE_KEYS)[keyof typeof FEATURE_KEYS];

export const FEATURES: Record<FeatureKey, { route: string; enabled: boolean }> = {
  dashboard: { route: "/dashboard", enabled: true },
  workspaces: { route: "/workspaces", enabled: false },
};
```

**The union is derived, never hand-written** beside a matching object the two could disagree
about. A key is referenced as `FEATURE_KEYS.dashboard`, never the bare string (02 §3).

`ROUTES`, the nav, and each feature's label and blurb are *derived* from this registry rather than
restating it. `features.const.test.ts` asserts what the type system cannot: no two features share
a route, every key has an icon and a label, `ROUTES` agrees with `FEATURES`.

## 2. Disabled is not hidden, and not a 404

Every page is built by `featurePage()`, the only place the flag is read:

```tsx
export default featurePage(FEATURE_KEYS.dashboard, DashboardHome);
export default featurePage(FEATURE_KEYS.reports);          // not built yet — no second argument
```

Hand-writing the check per page is how a codebase ends up with ten routes that ignore their flag.

A disabled feature stays visible in nav with a **Coming soon** marker, and its route renders the
shared disabled shell. **Never a 404** — that reads as broken. **Never the real screen
half-working** — that is the silent-success defect wearing a UI.

Development-only surfaces (a component catalog, say) are deliberately *not* registry entries —
they would appear in nav — and are gated separately with a real `notFound()`. There, 404 is
correct: there is nothing to tell a user is coming soon.

Flipping a flag is a one-line change. Never gate a feature with an inline `if`, a duplicated route
guard, or an env var read in more than one place. Use the `enable-feature` playbook, which refuses
to flip a flag whose screen is not actually built.

This is one global switch. If per-account overrides are ever needed, that is a database read
inside `isFeatureEnabled()` — **not a second flag system.** Record it in `docs/DECISIONS.md` first.

## 3. Every feature ships its own `AGENTS.md`

Required, and updated in the same change. This is tier 2 of the lookup system: it is what lets an
agent answer "does something here already do this?" without reading the folder.

```md
# `workspaces`

One paragraph: what this feature is. Feature flag: `workspaces`, enabled.

## Status
| Endpoint | Status | Source |
|---|---|---|
| `workspaces.list` (GET) | Live, session-scoped. 401 without a session. | `app/api/workspaces/route.ts` |

## Inventory
- `components/WorkspaceDirectory` — the screen. Owns search, filter and the add-modal state.
- `hooks/useCreateWorkspace.ts` — the only `useMutation` here; invalidates `workspaces.list`.

## Next real work
The one concrete thing that would move this forward.
```

A **declared but unbuilt** feature keeps the same shape with `**Status: not built yet — this
folder holds only this document.**` at the top. That is not a placeholder; it is the honest state
of a route that is in nav and flagged off.

`## Next real work` is mandatory in both. A feature index without it is a document nobody will
ever act on.

`npm run guard` checks that every feature has this file. It cannot check that the file is still
*true* — run the `sync-index` playbook for that, and treat it as a review question.

## 4. The sign-in surface is not a feature

Auth routes live in their own route group, outside the app shell — a signed-out person has nothing
to navigate. Their paths are constants, deliberately not registry entries: the registry describes
navigable screens with an on/off switch, and sign-in is neither optional nor navigable.

No auth vendor is prescribed. If you add one, confine it to a single module the way `server/db/`
is confined (01 §8), and add an ESLint zone so it stays confined.

## 5. Traps that have already cost time

*(Empty in the template.)*
