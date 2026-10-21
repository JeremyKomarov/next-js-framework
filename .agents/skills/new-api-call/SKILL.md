---
name: new-api-call
description: Build a complete API call - endpoint const, Zod DTO, domain type, mapper, fetcher, query key, TanStack hook and Route Handler, optionally with a mock. Use when adding any data fetch or mutation.
argument-hint: [name] [--mock]
arguments: [resource]
---

# new-api-call

Enforces `03 §1`–§3. Follow the order; each step is one file.

**Input:** `$resource` — the resource name, camelCase singular or plural as reads naturally.
`--mock` anywhere in `$ARGUMENTS` — also generate the fixture and the flag branch.

## Steps

Every file's template is in `.agents/templates/api.md`, in this order.

1. `core/constants/api-endpoints.const.ts` — the URL as a const. Never a literal at a call site.
2. `<owner>/api/$resource.dto.ts` — the response schema, **and** the request input schema if
   there is a write. The input schema is the one the form and the Route Handler will both import.
3. `<owner>/types/$resource.types.ts` — the domain type.
4. `<owner>/api/$resource.mapper.ts` — pure DTO → domain.
5. `<owner>/api/$resource.api.ts` — the fetch. `toApiError` on failure, `Schema.parse` on success.
6. `core/constants/query-keys.const.ts` — the query key as a const.
7. `<owner>/hooks/use$resource.ts` — the only `useQuery`/`useMutation`. A mutation names what it
   invalidates.
8. `app/api/$resource/route.ts` — session check first, before reading the body. Errors are codes,
   never sentences. **A route that is not built returns 501, never a fake success.**

`<owner>` is the feature that needs it. If a *second* feature already needs it, put the whole
`api/ + hooks/ + types/` group in `shared/` immediately — do not cross-import.

## With `--mock`

9. `<owner>/api/$resource.mock.ts` — the fixture, **parsed through its own DTO schema at module
   load**. That parse is the entire justification for the mock existing.
10. The branch at the top of the fetcher: `if (env.useMocks) return <resource>Mock;`
11. Confirm `env.useMocks` defaults false and that `core/config/env.ts` throws at module load when
    it is true under `NODE_ENV === "production"`. If that check is missing, add it.

**Do not add MSW.** And if the endpoint does not exist at all yet, do not mock it — leave the
feature flag off and let the route render the coming-soon shell.

## Then

Add the endpoint row to the owning `AGENTS.md`'s `## Status` table, stating what is real *now*.

## Done when

`npm run verify` passes, and the screen shows real data — or a typed error state, which is also a
pass. Silence is not.
