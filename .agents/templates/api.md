# API call template

The whole eight-file chain in one read. Rules and the order: `03 §1`.

Rename `example` / `Example` throughout. `<owner>` is the feature that needs it; the moment a
second feature does, the whole `api/ + hooks/ + types/` group is promoted to `shared/`.

---

### 1. `core/constants/api-endpoints.const.ts`

```ts
export const API_ENDPOINTS = {
  examples: {
    list: "/api/examples",
    create: "/api/examples",
  },
} as const;
```

### 2. `<owner>/api/example.dto.ts`

Mirrors **our** Route Handler's wire shape — never an upstream service's payload. `snake_case` is
allowed here and nowhere else. The request schema lives here too, and is the *same* export the
form's `zodResolver` uses and the handler parses with (`03 §4`) — one definition, imported
twice, so the two cannot disagree. No prose in a schema: it says which field is wrong, the strings
layer says what to read.

```ts
import { z } from "zod";

export const ExampleDtoSchema = z.object({
  id: z.string(),
  display_name: z.string(),
  created_at: z.string(),
});

export const ExampleListDtoSchema = z.object({
  examples: z.array(ExampleDtoSchema),
  total_count: z.number(),
});

export const CreateExampleInputSchema = z.object({
  displayName: z.string().min(1),
});

export type ExampleDto = z.infer<typeof ExampleDtoSchema>;
export type CreateExampleInput = z.infer<typeof CreateExampleInputSchema>;
```

### 3. `<owner>/types/example.types.ts`

```ts
export interface Example {
  id: string;
  displayName: string;
  createdAt: Date;
}
```

### 4. `<owner>/api/example.mapper.ts`

The only place wire naming is allowed to touch. Components never see a DTO.

```ts
import type { Example } from "@/features/example/types/example.types";
import type { ExampleDto } from "./example.dto";

export function mapExampleDto(dto: ExampleDto): Example {
  return {
    id: dto.id,
    displayName: dto.display_name,
    createdAt: new Date(dto.created_at),
  };
}
```

### 5. `<owner>/api/example.api.ts`

The `fetch`, and nothing else — no mapping here. The mock branch lives at the top and nowhere
else; `env.useMocks` is false by default and throws at boot if it is true in production
(`03 §3`).

```ts
import { API_ENDPOINTS } from "@/core/constants/api-endpoints.const";
import { toApiError } from "@/core/api/api-error";
import { env } from "@/core/config/env";
import {
  ExampleDtoSchema, ExampleListDtoSchema, CreateExampleInputSchema, type CreateExampleInput,
} from "./example.dto";
import { exampleListMock } from "./example.mock";

export async function fetchExampleList() {
  if (env.useMocks) return exampleListMock;

  const response = await fetch(API_ENDPOINTS.examples.list, { cache: "no-store" });
  if (!response.ok) throw await toApiError(response);

  return ExampleListDtoSchema.parse(await response.json());
}

export async function createExample(input: CreateExampleInput) {
  const response = await fetch(API_ENDPOINTS.examples.create, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(CreateExampleInputSchema.parse(input)),
  });
  if (!response.ok) throw await toApiError(response);

  return ExampleDtoSchema.parse(await response.json());
}
```

### 6. `core/constants/query-keys.const.ts`

```ts
export const QUERY_KEYS = {
  examples: {
    list: ["examples", "list"] as const,
  },
} as const;
```

### 7. `<owner>/hooks/useExampleList.ts` and `useCreateExample.ts`

The only place this feature calls `useQuery` / `useMutation`, one hook per file (`01 §2`).
Components call the hook, never `api/` directly. Both hand components a domain object — a
mutation has no `select`, so it maps inside `mutationFn` — and a mutation names what it
invalidates, explicitly.

```ts
// <owner>/hooks/useExampleList.ts
import { useQuery } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/core/constants/query-keys.const";
import { fetchExampleList } from "@/features/example/api/example.api";
import { mapExampleDto } from "@/features/example/api/example.mapper";

export function useExampleList() {
  return useQuery({
    queryKey: QUERY_KEYS.examples.list,
    queryFn: async () => (await fetchExampleList()).examples.map(mapExampleDto),
  });
}
```

```ts
// <owner>/hooks/useCreateExample.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/core/constants/query-keys.const";
import { createExample } from "@/features/example/api/example.api";
import type { CreateExampleInput } from "@/features/example/api/example.dto";
import { mapExampleDto } from "@/features/example/api/example.mapper";

export function useCreateExample() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateExampleInput) => mapExampleDto(await createExample(input)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.examples.list }),
  });
}
```

### 8. `app/api/examples/route.ts`

Session first, and **before** reading any body, so an unauthenticated caller never triggers
outbound work. The proxy is not the security boundary (`01 §8`). Failures are a
code, never a sentence — the code picks the status (`03 §2`).

```ts
import { NextResponse } from "next/server";
import { requireSession } from "@/server/identity/session.server";
import { apiError, handlingApiErrors } from "@/server/api/error-response.server";
import { API_ERROR_CODES } from "@/core/api/api-error";
import { CreateExampleInputSchema } from "@/features/example/api/example.dto";

const ROUTE = "/api/examples";

export const GET = handlingApiErrors(ROUTE, async () => {
  const { accountId } = await requireSession();
  const rows = await listExamples(accountId);

  return NextResponse.json({
    examples: rows.map((row) => ({
      id: row.id,
      display_name: row.displayName,
      created_at: row.createdAt.toISOString(),
    })),
    total_count: rows.length,
  });
});

export const POST = handlingApiErrors(ROUTE, async (request: Request) => {
  const { accountId } = await requireSession();

  const parsed = CreateExampleInputSchema.safeParse(await request.json());
  if (!parsed.success) return apiError(API_ERROR_CODES.invalid_input, { route: ROUTE });

  return NextResponse.json(await createExampleRow(accountId, parsed.data), { status: 201 });
});
```

### Optional — `<owner>/api/example.mock.ts`

Parsed by its own DTO at module load. This is the whole reason mocks are permitted: a mock that
has drifted from the contract fails immediately and names the field, instead of teaching the UI a
shape the server never sends.

```ts
import { ExampleListDtoSchema } from "./example.dto";

export const exampleListMock = ExampleListDtoSchema.parse({
  examples: [{ id: "ex_1", display_name: "First example", created_at: "2026-01-01T00:00:00Z" }],
  total_count: 1,
});
```

---

**Then add its rows** to the feature's `AGENTS.md` — the endpoint in `## Status`, the hook in
`## Inventory`. Shape in `.agents/templates/index.md`.
