---
name: enable-feature
description: Turn a feature flag on, after verifying the screen behind it is actually built. Refuses to flip a flag whose feature is still a stub. Use when a feature is ready to ship.
argument-hint: [feature-key]
arguments: [feature]
---

# enable-feature

Enforces `04 §2`. **The check is the point, not the flip.** This is the exact
moment a screen can start looking live while being empty, which is the defect this codebase's
conventions exist to prevent.

**Input:** `$feature` — the feature key.

## Steps

**Refuse to proceed, and report which checks failed, unless all of these hold:**

1. `features/$feature/` has real components — not just an `AGENTS.md`.
2. The route page passes a screen component: `featurePage(FEATURE_KEYS.$feature, Screen)`, not the
   one-argument form.
3. The screen renders something other than a placeholder. Read it. A component whose body is a
   "coming soon" block or a `TODO` does not count.
4. If it reads data: the hook exists, the api function exists, and the Route Handler exists and
   does not return 501.
5. If it reads data with mocks: **stop.** A feature does not ship enabled on mock data. Either
   the endpoint is real, or the flag stays off.
6. Its strings exist and are registered in the i18n messages map — an enabled screen rendering
   `MISSING_MESSAGE` is worse than a disabled one.
7. `features/$feature/AGENTS.md` is shape A (built), its `## Status` table reflects what is actually
   live, and `## Next real work` is current.

**Then, and only then:**

8. Flip `enabled: false` → `enabled: true` in `core/config/features.const.ts`. One line.
9. Run `npm run verify`.
10. Load the route and confirm it renders the real screen.

## Done when

The route shows real content, and every check above passed rather than being waived. If a check
failed, the correct outcome is a report of what is missing — not a flipped flag.
