---
name: new-feature
description: Scaffold a new feature folder with its index doc, registry entry (flag off) and route page. Use when adding a new screen or feature area to the app.
argument-hint: [feature-name]
---

# new-feature

Enforces `04 §1`–§3 and `01 §2`.

**Input:** `$1` — the feature name, kebab-case (`content-queue`), which is also its route.

## Steps

1. **Check it does not exist.** If `features/$1/` is there, stop and say so.
2. Create `features/$1/AGENTS.md` from `.agents/templates/INDEX.feature.md` — **shape B**, the
   declared-but-unbuilt one. It is the honest state of a feature with no code.
3. Create `features/$1/CLAUDE.md` as the two-line shim — the import, plus the HTML-comment
   fallback that tells an agent to read `./AGENTS.md` directly if the import did not expand.
   Copy it verbatim from the repo root's `CLAUDE.md`. It holds no rules of its own.
4. Register the key in `core/config/features.const.ts`:
   - add to `FEATURE_KEYS` (camelCase key, kebab-case value if the route differs)
   - add to `FEATURES` with `{ route: "/$1", enabled: false }`
   - **`enabled: false`.** A feature is off until its screen is real. Use `enable-feature`
     to turn it on, which checks before it flips.
5. Create the route page at `src/app/(app)/$1/page.tsx` — a one-liner, no second argument:
   ```tsx
   export default featurePage(FEATURE_KEYS.<key>);
   ```
   `(auth)/` if the screen is outside the shell (`04 §4`). Everything this
   playbook creates is under `src/` (`01 §1`).
6. Add the label and blurb to wherever the feature strings live (`02 §9`).
7. Do **not** create empty `components/`, `hooks/` or `api/` folders. Directory levels that hold
   nothing buy nothing — they arrive with their first file.

## Done when

`npm run verify` passes, the feature appears in nav with a Coming soon marker, and its route
renders the disabled shell — not a 404, not a blank page.
