# 01 — Foundation

**Goal:** the layers exist, the tokens are real, and every rule the guards check has something to
check. `node bin/create.mjs` already left `npm run verify` green — this phase is what makes it
mean something.
**Depends on:** nothing
**Status:** not started

## Steps
- [ ] 01.1 — the folder skeleton from `.agents/docs/01-STRUCTURE.md` §1, each owning directory with its `AGENTS.md` (S)
- [ ] 01.2 — `core/styles/tokens.scss`: copy `.agents/templates/tokens.scss` in, re-hue the brand ramp, replacing `app/globals.scss` (`.agents/docs/02-COMPONENTS.md` §7) (S)
- [ ] 01.3 — `core/config/env.ts`, the validated chokepoint, including the mock-flag boot check (S)
- [ ] 01.4 — `core/api/` error taxonomy: codes, statuses, body schema, `toApiError` (M)
- [ ] 01.5 — `shared/utils/`: `cn`, `classMap`, `keysOf`, each with its test (S)
- [ ] 01.6 — `core/config/features.const.ts` + `featurePage()` + the disabled shell, and copy `.agents/kit/registry.test.ts` beside the registry (M)
- [ ] 01.7 — the i18n three-file setup from `.agents/docs/02-COMPONENTS.md` §9 (S)
- [ ] 01.8 — one real route through `featurePage()`, replacing the placeholder `app/page.tsx` (S)
- [ ] 01.9 — choose this project's shared UI kit with the `plan-kit` playbook, and plan it as phase 02 (S)

## Done when
`npm run verify` passes with tests that actually run, and one route built with `featurePage()`
renders the coming-soon shell with its flag off and real content with it on.

## Notes
This phase is the only one the framework prescribes. Everything after it is your project — add
phases with the `new-phase` playbook.
