# Structure — where things go, and what may import what

## 1. The layers

```
src/
  app/                  App Router. Routes only — thin, no business logic.
    (app)/              Signed-in surface, inside the shell.
    (auth)/             Sign-in surface, outside the shell. Not a feature (04 §4).
    api/                Route Handlers.
  core/                 App-wide configuration. Never UI. §3
  store/                Global client state. A sibling of core/, not inside it. §7
  shared/               The reuse layer — used by 2+ features. §4
    components/ hooks/ api/ types/ utils/
  features/<name>/      One folder per screen-owning feature. §2
  server/               Server-only modules. Never imported by a component. §8
    db/                 Optional. The only place a database client may be imported. §8
```

**Everything you write lives under `src/`; the whole framework lives under `.agents/`.** Those two
folders answer "is this mine or the framework's". What is left at the root is `docs/` and `plan/`
— both yours — plus the configs and `AGENTS.md`, which tool conventions pin there.

**Dependency direction is one-way and lint-enforced:**

```
app/  →  features/  →  shared/  →  core/
                            ↘  store/
```

`shared/`, `core/` and `store/` never import a feature. A feature never imports another feature.
Nothing outside `server/` imports `server/`. Each is an ESLint error naming the section it broke.

## 2. Inside a feature

```
features/<name>/
  AGENTS.md             Required. The index. 04 §3
  CLAUDE.md             Generated shim: one line, @AGENTS.md.
  components/<Name>/    One folder per component, even a one-file component.
  hooks/use<Name>.ts    One file per hook — a hook has nothing to co-locate.
  api/                  DTO schemas, mappers, fetchers, mocks. 03 §1
  types/                Domain types shared by 2+ files in this feature.
  strings/              Strings shared by 2+ of this feature's components. 02 §9
  store/                Feature-local state, only when useState is not enough. §7
```

**Every file sits in the folder of the thing it serves.** What two components share moves up to
the feature; what two features share moves up to `shared/`. Nothing loose at a feature root.

## 3. `core/` — configuration, never UI

`config/` (env, feature registry) · `constants/` (routes, endpoints, query keys, storage keys,
domain enums) · `api/` (the error taxonomy) · `i18n/` (translation setup) · `styles/` (tokens).

`core/` is what the app boots with; a store is what changes while it runs. A component or a store
in `core/` is in the wrong place.

## 4. `shared/` — the reuse layer

A component gets a folder, because it has things to co-locate. **A hook or a util does not, so it
is one file.** A folder holding only an `index.ts` buys nothing.

**The promotion path:** a component starts inside a feature. The moment a *second* feature needs
something close to it, generalize it into `shared/` — never copy it. Do not pre-build for a
hypothetical second use; the instant that use is real, promote. The `promote` playbook does the
move, the import rewrite and both index rows.

## 5. File naming

| Suffix | Rule |
|---|---|
| `<Name>/index.tsx` | The component. One folder per component. |
| `*.module.scss` | Its styles. Imported by exactly one file — its `*.classes.ts`. |
| `*.classes.ts` | Its class-name map, wrapped in `classMap()`. The only importer of the module. |
| `*.const.ts` | Enum-like values, sentinels, registries. The source of truth for their types. |
| `*.keys.const.ts` | A namespace const plus `keysOf(strings)`. Beside the strings file. |
| `*.strings.ts` | User-facing text, owned by whatever renders it. |
| `*.types.ts` | Types and interfaces only. |
| `*.dto.ts` | Zod wire contracts — response schemas and request input schemas. |
| `*.mapper.ts` | Pure DTO → domain function. |
| `*.api.ts` | The real `fetch` calls. |
| `*.mock.ts` | A fixture, parsed through its DTO at module load. 03 §3 |
| `*.repo.ts` | Database access. Only under `server/db/`. |
| `*.store.ts` | A Zustand store. |
| `*.server.ts` | Server-only. Starts with `import "server-only"`. |
| `*.test.ts` | Vitest, co-located beside the module it tests. |

No `*.schema.ts` — Zod schemas live in `*.dto.ts` as `XxxSchema` exports.

## 6. Import paths — always `@/`

`tsconfig.json` maps `@/*` to `src/`. Every cross-directory import uses it. Only same-directory
imports stay relative (`./providers`, `./Button.module.scss`). **A `../` chain is a lint error** —
it breaks when a file moves and hides what a component really depends on.

`vitest.config.mts` duplicates this alias. The two must agree, or a test fails as "cannot find
module" while the build is fine.

## 7. State — three kinds, three places

| Kind | Lives in |
|---|---|
| **Server state** — anything from or going to an API | TanStack Query, behind a `hooks/use<Name>` wrapping `api/` |
| **Cross-feature client state** | a Zustand store in top-level `store/` |
| **Feature-local client state** | `useState` first; a store in the feature's own `store/` only when more than one tree must read it |

**Never copy server data into a store "for convenience."** It goes stale, and the query cache is
already the shared copy you were reaching for. The signed-in user is not client state: identity is
resolved on the server and passed down as a plain prop.

A store is read through an accessor hook, never directly from a component — the accessor is where
the "nothing selected yet" fallback lives, so every caller gets the same answer.

```
store/active-workspace.store.ts     the raw store — not imported by components
shared/hooks/useActiveWorkspace.ts  resolves the stored id into a real domain object
```

## 8. The server boundary

**Route Handlers own the dangerous parts.** Authentication, tenant scoping, upstream calls and
secret handling live in the handler. Components and hooks never call an external service directly.

```ts
export const GET = handlingApiErrors(ROUTE, async () => {
  const { accountId } = await requireSession();          // before reading the body
  const rows = await listWorkspaces(accountId);          // scoped by what the check returned
  return NextResponse.json({ workspaces: rows.map(toDto) });
});
```

The proxy — `src/proxy.ts`, which Next 16 renamed from `middleware.ts` — redirects signed-out
browsers, but **the proxy is not the security boundary**: a handler that skips the check is
unprotected regardless.

**Nothing reaches the browser.** Every file under `server/` starts with `import "server-only"`,
and ESLint blocks `@/server/**` from `features/`, `shared/`, `core/` and `store/`. Two mechanisms,
because this one leaks credentials when it fails.

> **The database is optional and confined.** `server/db/` is the only directory permitted to
> import a database client. Features import named async functions from `*.repo.ts`, never a
> client.

No ORM is prescribed — pick one per project, or have no database, in which case the directory
never exists and nothing else changes. There is deliberately **no repository interface**: a folder
boundary plus a lint zone keeps the database swappable, and an interface with one implementation
is only a layer to read through.

**Secrets** go through one validated module — `core/config/env.ts` for public values, its server
sibling for private ones. ESLint blocks `process.env.NEXT_PUBLIC_*` anywhere else, so a missing
value fails once, loudly, at boot rather than as `undefined` three screens deep.

A handler that cannot do its job **says so with a code** (03 §2). It never returns `200` with an
empty list to keep the UI quiet. A route that is not built yet returns `501` / `not_implemented` —
never a fake success.

## 9. Traps that have already cost time

*(Add an entry the first time something here costs someone an afternoon — attached to the rule it
justifies, so the rule stops looking arbitrary. One to start you off:)*

**`server/db/` is exempt from its own rule, and `app/` is half-exempt.** A Route Handler may
import a `*.repo.ts` but not the client; `server/db/` may import the client. Both are override
blocks in `eslint.config.mjs`, and both are load-bearing — a config that forbade the client
everywhere would forbid constructing it at all.
