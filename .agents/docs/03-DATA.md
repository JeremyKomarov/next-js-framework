# Data — API calls, errors, mocks, forms

**Real-only data policy.** Calls hit real Route Handlers. Missing credentials, incomplete upstream
contracts and failures stay visible as typed error states. Nothing substitutes fabricated success
data — §3 is the one narrow, loudly-labelled exception.

## 1. A read, in order

The most repeated act in the codebase. Each step is exactly one file.

| # | File | Contains |
|---|---|---|
| 1 | `core/constants/api-endpoints.const.ts` | the URL, as a const. Never a literal at a call site. |
| 2 | `<owner>/api/<name>.dto.ts` | `<Name>DtoSchema` — Zod, mirroring **our** handler's wire shape. |
| 3 | `<owner>/types/<name>.types.ts` | the domain type components actually see. |
| 4 | `<owner>/api/<name>.mapper.ts` | pure `Dto → Domain`. The only place wire naming may appear. |
| 5 | `<owner>/api/<name>.api.ts` | the `fetch`. Nothing else. |
| 6 | `core/constants/query-keys.const.ts` | the query key, as a const. |
| 7 | `<owner>/hooks/use<Name>.ts` | the only `useQuery` / `useMutation` for it. |
| 8 | `app/api/<name>/route.ts` | the handler (01 §8). |

`<owner>` is the feature that needs it. The moment a **second** feature needs it, the whole
`api/ + hooks/ + types/` group is promoted to `shared/` (01 §4). Do not cross-import.

```ts
// 2. workspaces.dto.ts — snake_case is allowed here and nowhere else
export const WorkspaceDtoSchema = z.object({
  id: z.string(),
  primary_host: z.string(),
  connected_at: z.string(),
});
export const WorkspaceListDtoSchema = z.object({ workspaces: z.array(WorkspaceDtoSchema) });

// The request schema lives here too, and the form shares it (§4).
export const CreateWorkspaceInputSchema = z.object({ primaryHost: z.string().min(1) });
```

```ts
// 4. workspaces.mapper.ts — the only place wire naming touches
export const mapWorkspaceDto = (dto: WorkspaceDto): Workspace => ({
  id: dto.id,
  primaryHost: dto.primary_host,
  connectedAt: new Date(dto.connected_at),
});

// 5. workspaces.api.ts
export async function fetchWorkspaceList() {
  if (env.useMocks) return workspaceListMock;              // §3
  const response = await fetch(API_ENDPOINTS.workspaces.list, { cache: "no-store" });
  if (!response.ok) throw await toApiError(response);
  return WorkspaceListDtoSchema.parse(await response.json());
}

// 7. useWorkspaceList.ts
export function useWorkspaceList() {
  return useQuery({
    queryKey: QUERY_KEYS.workspaces.list,
    queryFn: async () => (await fetchWorkspaceList()).workspaces.map(mapWorkspaceDto),
  });
}
```

**Four standing rules:**

- A component imports `hooks/`, **never** `api/`.
- A hook contains no `fetch` — it calls the api function.
- A mutation names the query keys it invalidates, explicitly.
- The request input schema is **one** schema, shared by the `zodResolver` and the handler's
  `.parse()`.

Full working chain, all eight files: `.agents/templates/api.md`.

## 2. Responses — one shape, always

Success is the DTO. Failure is the error envelope, defined once in `core/api/`:

- `API_ERROR_CODES` — the object every code comes from. `ApiErrorCode` is **derived** from it, so
  a code that does not exist cannot be written.
- `API_ERROR_STATUS` — the HTTP status each code answers with. **The code picks the status**, not
  the handler.
- `ApiErrorBodySchema` — the wire shape, validated at both ends.
- `ApiError` — the only error a frontend API call throws.

`toApiError()` reads **the body's `code`**. HTTP status is only the fallback, for responses that
never reached one of our handlers. Deriving the code from the status collapses every
distinguishable failure that shares a status into one.

**Servers return codes, never sentences.** What the person reads is `t(errorKeys[error.code])`.
`ApiError.message` is a developer diagnostic naming the code and status — it is never rendered. An
upstream English sentence must never reach a screen.

## 3. Mocks

A mock is the exact shape of the defect the real-only policy forbids: something that reports
success without doing the work. Four rules make it safe, and they are cheap.

**1. A mock is parsed by its own DTO, at module load.**

```ts
export const workspaceListMock = WorkspaceListDtoSchema.parse({
  workspaces: [{ id: "w_1", primary_host: "example.com", connected_at: "2026-01-01T00:00:00Z" }],
});
```

This is the whole reason mocks are permitted. A mock that has drifted from the contract fails
immediately and names the field, instead of teaching the UI a shape the server never sends.

**2. One switch, off by default** — `env.useMocks`, read only through `core/config/env.ts`. The
branch lives at the top of `*.api.ts` and nowhere else. No interception layer.

**3. Mocked is visible.** When the switch is on, the app renders a persistent banner. A mock
nobody can see is worse than no mock — it is a screen that looks live and is not.

**4. It cannot reach production.** `core/config/env.ts` throws at module load if the mock flag is
truthy while `NODE_ENV === "production"`. Fail-closed, at boot, in one place.

**Deliberately not MSW.** When the api layer is a single `fetch` in one file, a mock is a branch
plus a fixture. MSW is a dependency, a worker, and a second place the contract lives.

**The honest alternative.** For a screen whose endpoint does not exist *at all* yet, the default
is not a mock — it is the feature flag. Leave it `enabled: false` and let the route render the
coming-soon shell (04 §2). Mocks are for an endpoint that is **specified but not yet reachable**,
not for pretending a feature exists.

## 4. Forms

`react-hook-form` + `zodResolver`, for every non-trivial form. **The schema is not new** — a form
validates with the *same* Zod input schema the Route Handler parses. One export, imported by both:

```tsx
const form = useForm({ resolver: zodResolver(CreateWorkspaceInputSchema) });
```

```ts
const input = CreateWorkspaceInputSchema.parse(await request.json());
```

The form and the server cannot disagree about what is valid, because there is one definition.
Where they *must* differ — a confirm-password field the server never sees — the form schema
`.extend()`s the shared one rather than restating it.

**Field-level messages are not in the schema.** The schema decides *which* field is invalid; the
strings layer decides what the person reads (02 §9). A schema carrying English prose cannot be
translated.

Submit goes to a mutation hook (§1), never a bare `fetch`. Server failures arrive as codes and are
mapped through the strings layer — never rendered from `ApiError.message`.

## 5. Traps that have already cost time

*(Empty in the template.)*
