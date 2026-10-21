# Decisions — the framework's

Why the conventions in `.agents/` are what they are. Numbered and append-only. Once a decision is
locked here, do not re-open it without a documented reason — **add a new numbered entry that
supersedes the old one instead of editing history.** A superseded entry stays in place, marked, so
the reasoning that produced it is still readable.

**This record is the framework's, and every update mirrors it with the rulebook beside it** — a
project never edits it. A project's own decisions are `docs/DECISIONS.md`, numbered from 1 (#34).
Cite an entry here as `.agents/docs/DECISIONS.md #N`, and one there as `docs/DECISIONS.md #N`;
`npm run guard` checks that both resolve. Within this file, `#N`. Entries written before #34 say
`docs/DECISIONS.md` for this record, which is where it lived.

Format: `## N. <the decision, stated as a claim>` · `**Locked YYYY-MM-DD.**` · the reasoning,
including the argument that was wrong · a blockquote for any rule that must survive verbatim.

---

## 1. SCSS Modules with BEM naming, and CSS custom properties for tokens

**Locked 2026-09-04.**

No Tailwind, no CSS-in-JS. Styles live beside the markup they style, scoped by the module system,
and every value comes from `core/styles/tokens.scss`.

BEM's usual justification — avoiding global collisions — does not apply inside a module. We use
it anyway for readability, so a stylesheet can be scanned without cross-referencing the JSX.

> No hardcoded colour outside `tokens.scss`. `npm run guard` fails the build on one.

## 2. A component's SCSS module is imported by exactly one file

**Locked 2026-09-04.**

A CSS Module's type is `{ readonly [key: string]: string }`, so a misspelled class type-checks,
evaluates to `undefined`, and renders nothing. That is a silent failure in the styling layer, and
it is invisible in review.

The class map plus `classMap()` turns it into a thrown error in development and a build failure in
CI. The single-importer rule is what makes the map the only way in.

## 3. Zod is the only validation library, and one schema serves both ends

**Locked 2026-09-04.**

The request schema a form validates with is the *same export* the Route Handler parses with. Not a
matching pair — one definition, imported twice. A form and a server that disagree about what is
valid is a bug class this removes entirely rather than manages.

Field-level prose stays out of schemas: the schema decides which field is wrong, the strings layer
decides what the person reads. A schema carrying English cannot be translated.

## 4. Three kinds of state, three places

**Locked 2026-09-04.**

Server state is TanStack Query's. Cross-feature client state is a Zustand store in top-level
`store/`. Everything else is `useState` until it demonstrably is not.

> Never duplicate server data into a Zustand store for convenience.

The failure this prevents is two copies of the same list disagreeing after a mutation.

## 5. React Hook Form with the Zod resolver, for every non-trivial form

**Locked 2026-09-04.**

Follows from #3. Stated explicitly so it is not mistaken for something assumed silently.

## 6. Next.js App Router, one application for UI and API

**Locked 2026-09-04.**

Route Handlers live beside the screens that call them. No separate API service until something
concrete needs one — and if that day comes, the `api/` layer is already the only thing that would
change, because components never fetch.

## 7. `@/` for every cross-directory import

**Locked 2026-09-04.**

A `../../../` chain breaks when a file moves and hides what a component really depends on. Only
same-directory imports stay relative. Lint-enforced.

## 8. A feature never imports another feature

**Locked 2026-09-04.**

If two features need the same thing, it is promoted to `shared/` — not cross-imported, not
copied. The ESLint config generates one restriction zone per feature from the registry, so the
rule scales without anyone maintaining it.

This is the rule that keeps features deletable. A feature that six others import is not a feature,
it is a library with a misleading address.

## 9. Every directory that owns things ships an `AGENTS.md`, updated in the same change

**Locked 2026-09-04.**

This is the framework's central mechanism, not documentation hygiene. It is how an agent answers
"does something here already do this?" for the cost of one small file instead of globbing a tree
and reading fifteen components.

> Adding, changing, or removing anything under a directory updates that directory's `AGENTS.md`
> in the same commit.

`npm run guard` proves the file exists. It cannot prove the file is still true — that is what
the `sync-index` playbook and code review are for.

## 10. The database is optional and confined to `server/db/`

**Locked 2026-09-04.**

No ORM is prescribed. Some projects have no database at all, in which case the directory does not
exist and nothing else changes.

> `server/db/` is the only directory permitted to import a database client. Features import named
> async functions from `*.repo.ts`, never a client.

**No repository interface, and no `DbAdapter`.** A folder boundary plus a lint zone keeps the
database swappable; an interface with one implementation would only add a layer to read through.
The tempting argument for the interface — "so we can swap the database" — is answered more cheaply
by the boundary, and the interface would have to be rewritten to swap anyway.

## 11. No auth vendor is prescribed

**Locked 2026-09-04.**

Auth is the most project-specific choice in a template and the most expensive to unpick. If you
add one, confine it to a single module the way #10 confines the database, and add an ESLint zone
so it stays confined. That single-module seam is what makes the vendor replaceable later.

## 12. i18n from day one, with keys derived from strings

**Locked 2026-09-04.**

Every user-facing string goes through `t()` from the first commit, even in a single-language
project. Retrofitting i18n is a find-and-replace across every component; doing it upfront costs a
file per component.

Keys are derived from the strings object by `keysOf()`, never hand-typed, so they cannot drift
from what they name. `next-intl` is the default binding and is one import deep.

## 13. Mocks are DTO-parsed, flag-gated, visible, and fail production boot

**Locked 2026-09-04.**

A mock is the exact shape of the defect this codebase forbids — something reporting success
without doing the work — so it is permitted only under four conditions, in `03-DATA.md` §3.

The load-bearing one: **a mock is parsed by its own DTO schema at module load.** A drifted mock
then fails immediately instead of teaching the UI a shape the server never sends.

**Not MSW.** When the api layer is a single `fetch` in one file, a mock is a branch plus a fixture.
MSW is a dependency, a worker, and a second place the contract lives. Revisit the day network-level
interception in tests is genuinely needed.

## 14. `AGENTS.md` is canonical; every other agent file is a pointer

**Locked 2026-09-05.** *The roster of five agents is superseded by #26, and the reason it gives for
the frontmatter allowlist is corrected by #30; the rest stands.*

The rulebook must work from **Claude Code, Codex, Cursor, Gemini CLI and opencode**, and from
whatever is next. Each one gets a file containing a pointer and no rules of its own.

> No agent-specific file ever contains a copy of a rule.

Six copies of a rulebook diverge inside a month, and the framework becomes the thing it was built
to prevent. Which agent reads what is verified per vendor rather than assumed — the published
cross-tool support lists are not reliable, and tools that claim to read `AGENTS.md` do not always
read a nested one.

**The roster is a maintenance promise.** Every name on it is a set of paths to re-verify each time
that tool ships a release, so a name nobody uses is a claim nobody checks. Five is the list;
adding a sixth means signing up to check it.

**Skills live in one place and reach every agent in the same commit.**

> A skill added, changed or deleted is synced in the same commit. Edit the canonical file, never a
> mirror.

The failure this prevents is specific and nasty. A *missing* skill is obvious — the command is not
there. A *stale* skill is invisible: the agent runs it, follows superseded instructions, and
reports success. That is the silent-success defect (#13) applied to the tooling instead of the
product, and it is worse there, because the wrong instructions then generate code in every project
the skill touches.

`.agents/skills/` is canonical, and **Codex, Gemini CLI and opencode read it there natively** — no
mirror, no adapter, nothing to drift. Only Claude Code and Cursor look elsewhere, so there are two
mirrors and zero generated adapters. A mirror is a symlink wherever the platform allows one,
precisely because a symlink **cannot** drift — the sync problem is deleted rather than managed.
The by-hash comparison exists only for the platforms that refuse them.

**Cursor needs one extra pointer.** It reads the root `AGENTS.md` and stops; it does not pick up a
directory's own `AGENTS.md` the way Codex and Claude Code do. Tier 2 is the whole lookup system
(#9), so without help Cursor is the one agent answering "does something here already do this?" by
globbing. `.cursor/rules/agents-md.mdc` is an always-applied pointer that holds no rule of its own.

**Every shim is written by `sync`,** never by hand — `CLAUDE.md` beside each `AGENTS.md`,
`GEMINI.md`, the Cursor rule. A feature index created next month gets its shim without anyone
remembering, and the scaffolder holds no second copy of the text. The guard does not demand a
`CLAUDE.md` from a project with no `.claude/`, which would be it failing over an agent nobody
there runs.

**What is not claimed is that the five behave identically.** `name` and `description` are the only
frontmatter keys all of them honour; opencode recognises the narrowest set and ignores the rest.
So the instruction belongs in the **body** of a `SKILL.md`, never in its frontmatter. A playbook
that only works when `allowed-tools` is respected is one that half the agents run differently,
quietly.

And one silent disappearance, which is why frontmatter is held to an allowlist at all: a
`SKILL.md` carrying `paths:` — a key from Cursor's *rules* format, not the skills format — was
dropped whole by Claude Code, with no error in any log. The playbook was simply absent from one
agent. An unknown key is the cheapest way to cause exactly the failure the guard exists for.

## 15. The shared UI kit is built before the first feature, with its variants

**Locked 2026-09-05.** *The fixed list of ten is superseded by #27 — the kit is chosen per project.
The rest stands.*

Ten primitives — Button, Field, Modal, Alert, Toast, StatusBadge, EmptyState, PageHeader, Icon,
AppShell — exist in `shared/` before a feature screen is written, each carrying its variation
surface as exported consts and its own responsive behaviour.

> A primitive is shared on first use, not on second. It grows by a value in its variant const,
> never by a near-copy beside it.

This is the one place the framework overrides its own "do not pre-build for a hypothetical second
use" rule (`01-STRUCTURE.md` §4), and the exception is narrow on purpose: it covers only
primitives that name nothing from the domain. Anything that names an entity or a workflow still
starts feature-local and is promoted.

The reason is that the promotion path works for the domain and fails for primitives. A feature
that needs a button at 2am does not run the `promote` playbook — it writes a button, because the
existing one is three folders away and shaped for someone else's screen. By month two there are
five, none with a focus ring, and unifying them is a refactor nobody schedules. The observed
failure, in a real project audited against this framework: fourteen distinct breakpoint values
(`23rem`, `30rem`, `32rem`, `36rem`, `38rem`, `40rem`, `42rem`, `52rem`, …) across one app, every
one defensible on its own and no two components agreeing. Hence the named scale in
`02-COMPONENTS.md` §8, and hence the kit up front — a primitive that exists is extended, and a
primitive that does not is reinvented.

The cost is real and accepted: some of the kit is built before anything renders it, and a piece
of it may go unused. That is a smaller bill than five buttons.

## 16. The whole framework lives in `.agents/`; the app lives under `src/`

**Locked 2026-09-05.**

> `.agents/` is the framework. Everything else is yours. One folder, one sentence, no per-file
> judgement.

The problem this answers is not aesthetic. A template that dissolves into the project root is what
makes the lookup system cheap, and it was also the thing people could not read: the root held
twenty entries, six of them app code and fourteen of them framework, and nothing anywhere stated
which was which. The symptom, reported by the first person to use it, was "all files mixed up and
hard to tell what is project and what is framework."

**`src/` costs nothing, because nothing imports through it.** `@/*` maps to it, so
`@/shared/components/Button` is unchanged and every path in the rulebook reads identically. The
extra level exists only in the file tree — which is exactly where the confusion was. The argument
against it, that `src/` is indirection for its own sake, is right in general and wrong here.

The objection to hiding the framework in a dot-directory was that a rulebook people are required
to read should not be hidden. It is outweighed: nobody finds the rulebook by `ls`. They arrive
through a citation in `AGENTS.md`, a directory index or a playbook, all of which carry the path.
What `ls` is actually used for is the question this decision answers.

**The cost, which is not obvious and bit immediately.** `**` does not descend into a
dot-directory. Moving the framework into `.agents/` silently removed the rulebook, the playbooks
and the templates from every guard's scan, and all four then printed "clean" having read almost
nothing — a textbook silent success, in the enforcement layer, produced by the change meant to
make things clearer. Every guard now globs through one helper so the trap is named once. A sibling
fallback broke in the same move for the same reason: it located the project root by looking for a
`docs/` directory, and `.agents/docs/` is one.

> A guard that passes because it scanned nothing is worse than no guard. When a glob's root moves,
> prove the guard still fails on a real break before believing it passes.

Two more things had assumed a flat root and would have failed silently: the style guard compared
the token file by exact root-relative path, so under `src/` it would have flagged `tokens.scss`
for every hex it is supposed to define; and `vitest.config.mts` duplicated the `@/` alias pointing
at the config's own directory. Both are fixed, and the alias duplication is called out in
`01-STRUCTURE.md` §6 as a pair that must agree.

## 17. The plan says where the work is right now, not only what the work was

**Locked 2026-09-05.**

A phase status in an index and unchecked boxes in a phase file both describe intent. Neither says
what is being worked on *at this moment*, so anyone picking the repo up mid-work — a person on
Monday, or the next agent in a fresh context — has to read a diff to find out, and a step
abandoned half-done is indistinguishable from one never started. That is the silent-success rule
applied to the plan itself: a plan that reports nothing in flight while work is in flight reports
success it has not earned.

> One step is in flight at a time. It is marked `[~]` in its phase file, named in `plan/NOW.md`
> with a line on how it is going, and struck through when it is finished — in the same commit as
> the work, never as a follow-up.

`plan/NOW.md` is rewritten rather than appended to; the struck-through steps in the phase files
are already the history, and a second history diverges from the first. `guard` enforces the three
things that can drift: more than one `[~]`, a `NOW.md` that names a different step than the files
mark, and a `[x]` left unstruck. The index Now line stays phase-level, so the index keeps holding
status and nothing else (`05-WORKFLOW.md` §1) and the detail lives in one place.

**Why a marker and not a timestamp or a log.** Both rot without a writer. A marker cannot: it sits
on the line the work is about, and the guard fails the moment it disagrees with `NOW.md`, which is
the only way a convention survives contact with an agent that is in a hurry.

## 18. A project updates the framework in place, and the guards are the migration

**Locked 2026-09-05.**

The framework keeps improving after projects start using it. The alternatives were a git submodule
or subtree at `.agents/`, and both were rejected for the same reason: a project's own playbooks
live in `.agents/skills/` beside the framework's, and neither mechanism tolerates a directory with
two owners without ceremony every time. #16 had already made the cheaper answer available — if the
framework is exactly one directory, an update is a copy into that directory.

> `npm run update:framework` copies a newer `.agents/` in. It refuses a dirty tree, works on a
> branch, writes nothing outside `.agents/`, and commits nothing.

Those four are the safety, and they are deliberately dumb. There is no rollback format, no backup
directory, no transaction: git already is all three, and a mechanism that re-implements git is a
second thing to trust. The strong claim is the third one — **an update cannot break your code by
touching it, because it never opens it.** What it can do is change a rule your code now violates,
which is the point.

**How a project adapts is the part worth stating.** Not by a migration script — by failing.
`npm run verify` after an update names the file and the section that changed. That is what the
guards were for all along; an update is just the moment they earn it. What a guard cannot see —
a convention that changed meaning, a rename with no checkable trace — goes in `.agents/UPGRADING.md`,
newest first, and the updater prints every entry above the version the project was on.

**The one thing a copy cannot get right by itself** is a framework playbook deleted upstream:
mirroring `skills/` would delete the project's own, and not mirroring leaves a dead playbook to be
followed confidently — the exact failure `guard` exists to prevent. So `version.json` records the
playbook names the framework shipped, and only those are removed when they disappear. A project's
own playbook is never in that list and is never touched.

## 19. Cross-platform correctness is a guard's job, not the operator's

**Locked 2026-09-05.**

The first real run of this framework was on Windows, and three of its four guards were wrong there
in ways that all looked like the project's fault rather than the tooling's. The skills guard built
paths by stripping a `/`-terminated prefix from a `globSync` result, so on Windows every path
stayed absolute: it reported ten skills missing from a complete mirror, then died with `ENOENT`
trying to repair it. With `core.autocrlf=true` and no `.gitattributes`, the generated playbook
table never matched the file it was compared to — a permanent red on a clean tree. And the plan
guard checked that its three markers agreed *when they existed*, never that they existed at all,
so the cheapest way to satisfy it was to write nothing.

The tempting fix is a README line telling people to enable Developer Mode and set
`core.autocrlf=false`. **A convention that depends on every machine being configured correctly is
not enforced, it is hoped for** — and here the guard blamed the project for a defect in itself, so
the first thing anyone does is stop trusting the guard.

> A check normalises path separators and line endings before it compares anything, and repairs
> what it can rather than printing a shell command for a person to run. `sync:agents` creates the
> mirrors — symlink where the platform allows one, verified copy where it does not. Nobody types
> `ln -s`.

The plan hole is the same principle one level up: a status and a `[~]` marker now imply each other
in both directions (`.agents/docs/05-WORKFLOW.md` §2). Marking a step and writing three lines is a
moment's work; skipping it is a failed `npm run verify` rather than something to remember at the
end of a long session.

## 20. The rulebook is five files, and a rule is fetched by section, not read by file

**Locked 2026-09-05.** *The playbook list in the root `AGENTS.md` is superseded by #26 — there is
none; the rest stands.*

Every rule is addressed as `NN §N`, and `node .agents/cli.mjs rule 02 7` prints that section and
nothing else.

> Fetch the section; do not open the file. `rule` with no arguments prints every section, one line
> each, and is the right first move when you do not yet know which one you want.

Two failures produced this, and only the second one is interesting.

The first was volume: the rulebook had grown to twelve files and ~8,600 words that repeated each
other. Four were under 500 words and cross-cited so heavily that reading one meant reading three.
Merging to five fixed the repetition. The tiering argument in #9 says small files that load on
demand; it does not say *twelve*.

The second is the shape, and merging did not touch it. `NN §N` was always the address format and
**nothing could fetch one**, so every citation was answered by reading the whole file. `02 §7` is
~330 words inside a document of ~1,840 — five sixths of that read is waste, repeated on every
citation an agent follows, and an agent following three in a task pays for most of the rulebook
without being asked to read it. **An index that routes to a document you must read whole is not an
index, it is a table of contents.**

Two consequences, both deliberate. The map is generated from the files themselves, so it cannot go
stale and there is no second artifact to keep in step — it is also cheaper (~280 words) than the
`00-INDEX.md` page that describes it. And the root `AGENTS.md` carries a list of playbook *names*
rather than a generated table of their descriptions: every agent this framework supports discovers
skills itself and loads each `description:` at startup, so that table was a second copy of
something already in context, in the one file that loads on every session. Names cost ~40 words
instead of ~410.

**Renumbering a section is a breaking change** across code comments, directory indexes and
playbooks, and `npm run guard` says so. Add a section; do not renumber one.

## 21. The framework ships a `create` command, and it is not published to npm

**Locked 2026-09-05.**

> `node bin/create.mjs <name>` asks three questions and leaves a repository where `npm run dev`
> and `npm run verify` both pass. `new-project` is a short playbook pointing at it.

The alternative was a written setup procedure, and the one that existed could not be followed. Step
one said run `create-next-app` in the template directory. It refuses any directory holding files it
does not recognise, and this one holds `AGENTS.md`, `.agents/` and `plan/` — so it failed before it
started. The steps after it referred to `npm run` in a template that had no `package.json`, and told
people to run `ln -s`, which does not exist on Windows. **A setup procedure nobody has executed end
to end is a document, not a procedure.**

Fixing the steps one by one was rejected, because they encode facts that move: that
`create-next-app` writes its own `AGENTS.md` and re-adds it on every `next dev`, that its default
`layout.tsx` uses a type only generated by a build, that npm rejects a staging directory whose name
starts with a dot. Each of those was found by running the thing. **Prose cannot be run.**

It is deliberately **not** published to npm. A local script in the template is one file you can
read, run and change; a published `create-` package is a release process, a version to keep in step
with `.agents/version.json`, and a name to own. Nothing about the CLI needs npm — a `bin` entry and
a `files` list can be added the day that changes.

## 22. The guard is tested, and CI runs it on Windows

**Locked 2026-09-05.**

`.agents/cli.mjs` is the only thing enforcing every convention in this repository. Nothing enforcing
it is the same bet #16 warns about, one level up.

> `.agents/cli.test.mjs` builds a throwaway project, breaks exactly one thing, and asserts the
> guard names it. Every check has both directions: it fails on the break, and it passes on a
> correct project.

The negative cases are the obvious half. The positive cases are the half that keeps the guard
alive — **a check that fires on correct code is disabled within a week**, so the empty project has
a test, and so does every false positive found so far: `url(#fade)` is an SVG filter reference and
not a four-digit hex colour, `var()` contains no colours, a hex in a block comment is prose.

Writing the tests immediately found two defects. The citation check understood the `NN §N` address
format but not a plain markdown link to the same document, so a link to a rulebook file deleted in
the merge described in #20 sat in the seeded plan index, invisible. **A checker that understands
one of two ways to reference something reports clean on half the references.** And the guard's own
test file, full of deliberately broken citations, was copied into every scaffolded project, where
it failed that project's own docs check. Both were found by running the thing, which is #21's
lesson again.

**CI runs the whole suite on Linux, Windows and macOS, and scaffolds a real project on each.**
Every cross-platform defect this framework has had was found somewhere other than Linux (#19), so
a green Linux-only matrix would have caught none of them.

The three are in the matrix for three different reasons, and only the first is the famous one.
Windows brings absolute paths out of `globSync`, CRLF, symlinks refused without developer mode,
and npm as a `.cmd` shim. **macOS brings a case-insensitive filesystem by default** — the skill
mirrors are compared by path and by hash, so any assumption that `SKILL.md` and `skill.md` are two
different files is correct on Linux and wrong on APFS. There is no special test for that; running
all 32 on macOS *is* the test, which is the point of a matrix rather than a mock. Linux is the one
platform where every one of these is invisible.

The scaffolder gets its own job for the reason in #21 — it shells out to `create-next-app`, merges
a `package.json` and rewrites entry files, and every bug ever found in it was found by executing
it.

## 23. Icons come from exactly one library — `lucide-react` — wrapped by exactly one component

**Locked 2026-09-06.**

The template's own `Icon` entry used to describe itself as a hand-kept, hand-drawn SVG set: "the
icon set, keyed," with "icon packages" listed in the `Replaces` column as one of the things it
exists to prevent. That was backwards. A hand-rolled SVG set is a second design system nobody
signed up to maintain — every icon redrawn at a slightly different stroke width, a slightly
different grid, by whoever needed one next — which is the fourteen-breakpoint failure in #15
again, one SVG at a time instead of one `rem` value at a time.

> `shared/components/Icon` is the only file permitted to import an icon library. Everywhere else
> renders `<Icon name={ICONS.settings} />`; nothing else ever writes `<svg>` or imports
> `lucide-react` directly. ESLint enforces the import half; review enforces the markup half.

**`lucide-react` is the library, chosen and re-checked at lock time:** ~5M weekly npm downloads
against Heroicons' ~2M and Phosphor's ~700k, 1,500+ icons, MIT, tree-shakable (each icon is its own
module, so unused ones cost nothing in the bundle), and it is the default `shadcn/ui` ships with —
which means most component recipes copied from the ecosystem already assume it. Phosphor's
seven weights and Tabler's larger set are both reasonable second choices, and neither is close
enough on adoption or maintenance velocity to be worth hedging between two libraries in one
project.

**One wrapper, not a bare import everywhere,** for the same reason `server/db/` owns the database
client (#10): swapping the library later — or discovering a name that does not exist in it — is a
one-file fix instead of a grep across every screen. The wrapper's export is a keyed map
(`ICONS.settings`, never `"settings"`), matching the enum-const convention every other primitive
already uses (02 §3), so an icon is referenced the same way a status tone or a route is.

This supersedes the `Replaces` cell in `.agents/templates/index.md` and the `Icon` line in
`02-COMPONENTS.md §6` as they read before this entry — both now describe the wrapper, not a
prohibition on the thing it wraps.

## 24. The plan check also runs pre-commit, via `core.hooksPath` — not only at `npm run verify`

**Locked 2026-09-06.** *The last paragraph — the scaffolder never runs `git init` — is superseded
by #28, which made it; the rest stands.*

#17 and #19 made the plan self-checking in both directions, and #22 made the check itself tested.
Both assumed the check would actually get *run* — and in practice it was run at `npm run verify`,
which is usually right before opening a PR. A plan can drift for several commits before that,
which is exactly the failure §2 of `05-WORKFLOW.md` exists to prevent: an agent stops mid-step,
`NOW.md` still names it, and nobody notices until review, by which point reconstructing what was
actually done is a worse job than writing the three lines would have been.

> `npm install` (its `postinstall` script) runs `node .agents/cli.mjs hooks`, which points
> `core.hooksPath` at `.agents/kit/hooks` — a directory inside the framework, versioned and copied
> by `update:framework` like everything else in it. Its `pre-commit` script runs
> `check --only=plan` and blocks the commit on failure.

**`core.hooksPath` over Husky,** for the reason DECISIONS.md has given every other time a
dependency was on the table (#13, #21): the whole framework is dependency-free and this did not
need to be the exception. `core.hooksPath` has been in git since 2.9 (2016), needs no
`node_modules` entry, and the hook script itself is one file anyone here can already read. The
alternative — writing straight into `.git/hooks/`, which git never tracks — would need a symlink
per clone, the exact ceremony #16 and #19 already removed for the skill mirrors.

**A hook is a courtesy, not the enforcement.** Anyone can run `git commit --no-verify`, and a
person is not blocked from doing that on purpose. What actually cannot be skipped is CI running
`npm run guard` on every push (#22) — the hook only moves the same check earlier, from "before the
PR" to "before the commit that caused the drift," which is the point in the workflow where fixing
it costs three lines instead of an investigation.

**Freshly scaffolded projects need one manual step**, because `create.mjs` never runs `git init` —
there is nothing for `core.hooksPath` to attach to during the `npm install` the scaffolder already
runs. `new-project`'s first instruction is now `git init && npm run hooks`, in that order, before
the phase work described in #17 starts.

## 25. The framework ships real default token *values*, not only the groups

**Locked 2026-09-06.**

`02-COMPONENTS.md §7` always specified the token groups — brand ramp, neutral ramp, the semantic
quads, the type and spacing scales — and left every value blank: "the framework specifies the
groups; the values are yours." That reads as flexibility and works as a trap. Phase 01.2 is one
step (`plan/01-foundation.md`), sized `M` before this entry, done under the same time pressure as
every other step in the phase that made the app boot — and a colour ramp invented in that spot,
by whoever is doing phase 01 that day, is not where good default contrast and a coherent semantic
palette reliably come from. Nineteen ramps built this way is the failure in #15 again, one project
at a time instead of one component at a time: nobody's is wrong on its own, and no two look like
they belong to the same design system.

> `.agents/templates/tokens.scss` is a complete, real `core/styles/tokens.scss` — every group in
> `02-COMPONENTS.md §7` filled with values chosen for contrast and consistency: a brand and neutral
> ramp built to sit together, four status quads at readable text-on-surface contrast, the reset,
> the base element rules and the `prefers-reduced-motion` block. Phase 01.2 copies it in and
> re-hues the brand ramp; it does not invent the shape of one.

**Re-hue the brand ramp, keep the rest,** is the intended edit — not a suggestion to leave every
value alone forever. A project that wants a colder or warmer neutral, or a different type scale,
still owns `tokens.scss` completely; the point is that the *starting* value is a considered
default rather than a blank the phase has to fill under pressure, the same argument #15 already
made for components. **No dark theme is prescribed.** Nothing in the rulebook mentions one, and a
light-only default that is genuinely finished is worth more than a light-and-dark pair where the
second is a guess never checked at 360px, 768px or 1280px (`02 §8`).

This supersedes the "the values are yours" sentence in `02-COMPONENTS.md §7` as it read before
this entry.

## 26. Two agents are supported: Claude Code and Codex

**Locked 2026-10-21.** Supersedes the five-agent roster in #14; everything else in #14 stands.

#14 called the roster a maintenance promise: every name on it is a set of paths to re-verify each
time that tool ships. Cursor, Gemini CLI and opencode were on it and in use by nobody here, so they
were exactly the claim nobody checks. Each cost real code — a generated Cursor rule, a Gemini shim
and settings file, a legacy `.toml` pruner, a marker directory per agent to say whether it was in
use — and every one of those was a place for a silent failure in an agent nobody would notice was
broken.

> The framework supports Claude Code and Codex, and both are always wired. There is no per-agent
> switch.

**Codex** reads `AGENTS.md` and `.agents/skills/` where they are; it needs no file of its own.
**Claude Code** reads neither, so `sync` writes a `CLAUDE.md` shim beside every `AGENTS.md` and
symlinks `.claude/skills` to the canonical skills. Both are required by the guard unconditionally —
the "is `.claude/` present?" test is gone, because an agent that is always supported is never
absent.

**The generated playbook table in `AGENTS.md` is gone too.** It existed for agents with no skill
system. Both remaining agents list skills natively and load each `description:` at startup, so the
table was a second copy of something already in context, in the one file loaded every session.

**What the two do not share is still the reason the instruction lives in a skill's body.** Only
`name` and `description` are read by both; `disable-model-invocation`, `argument-hint` and
`allowed-tools` are Claude Code's. Codex invokes a skill as `$name`, Claude Code as `/name`.

Adding a third agent means adding an entry that supersedes this one, and signing up to verify its
paths on every release.

## 27. The shared kit is chosen per project, from its screens

**Locked 2026-10-21.** Supersedes the fixed list of ten primitives in #15; the rest of #15 stands.

#15 was right that primitives must exist before the first feature screen, and wrong to name the
same ten for every project. A landing page has no `AppShell`, an admin tool needs a `Table` the
list never mentioned, and a consumer app may never show a `StatusBadge`. A prescribed list gets
built whole because it is prescribed — the "cost accepted" in #15 was paid in every project,
including the ones where most of the kit went unused — and it says nothing about the primitives a
project actually needs that are not on it.

> The kit is the primitives the project's first screens share, decided by the agent from those
> screens with the `plan-kit` playbook, and recorded in `shared/AGENTS.md` with what was left out
> and why.

What does not change: a primitive still lives in `shared/` from its first use, with its variants
(`02 §6`), whether or not the kit named it. The kit decides what is built *ahead* of need, not what
is allowed in `shared/`. Recording what was left out is the part that stops the next agent
building it to "complete" the kit.

The decision is made once, after phase 01 and before the first feature screen, as step 01.9, and
re-made only when the product changes shape.

## 28. A project ships its own CI, and the framework's CI proves a scaffold passes its own gate

**Locked 2026-10-21.**

#22 and #24 both lean on "CI runs the full guard on every push" — the hook can be skipped, CI
cannot. But the scaffolder never copied a workflow: a project made in a new directory had no CI at
all, and one made in place kept the *framework's*, which runs `bin/create.mjs` — deleted by then —
and `npm run test` with nothing installed, so it failed on the first push. The check that could
not be skipped did not exist.

> Every scaffolded project gets `.github/workflows/verify.yml`, copied from
> `.agents/kit/ci/verify.yml`: `npm ci`, then `npm run verify`. After that it is the project's.

The framework's own CI had the matching gap. The README promises a repository where
`npm run verify` works, and the scaffold job ran with `--skip-install` — so typecheck, lint and
Vitest never ran against what the scaffolder wrote. A second job now installs a scaffold on Linux
and runs its `npm run verify`. And `create-next-app` is pinned to the kit's Next version rather
than `@latest`: it writes the files the scaffolder then rewrites, so an unpinned one changed what a
scaffold contained with no commit in this repository.

The scaffolder also runs `git init` before installing, unless the target is already inside a
repository, so `postinstall` has a repository to wire the pre-commit hook into. It was a printed
manual step, and a printed manual step is the one everyone skips.

## 29. The framework repository has its own root guide; a project's comes from a template

**Locked 2026-10-21.**

The root `AGENTS.md` of this repository *was* the project template, placeholders and all. So every
agent working on the framework was told "never edit `.agents/` in this project" — the opposite of
the job here — and told to mark steps in a `plan/` that is a seed, not a plan.

> A project's root guide is `.agents/templates/root-guide.md`; the scaffolder copies it to the
> project's `AGENTS.md`. The repository's own `AGENTS.md` is the guide for changing the framework.

It lives under `.agents/templates/` so `update:framework` keeps the template current, and it is not
named `AGENTS.md` there because the guard would then treat it as a directory index wanting a shim.

## 30. Skill frontmatter is held to the keys Claude Code documents, because it ignores the rest

**Locked 2026-10-21.** Corrects the reason for the allowlist given in `05 §4`; #26 stands.

The allowlist was justified as "a key Claude Code does not know makes it drop the whole skill." It
does not: Claude Code ignores an unrecognised key with no error and loads the skill. And the list
was too short — `paths`, `user-invocable`, `when_to_use`, `context` and others are documented keys
it rejected. The guard was right to exist for the wrong reason, and wrong about what to allow.

> Frontmatter keys are the ones Claude Code documents (`FRONTMATTER_KEYS` in `.agents/cli.mjs`).
> Anything else fails the guard, because Claude Code would ignore it in silence.

The real failure is quieter than a missing skill. `disable_model_invocation: true` — underscores —
is ignored, so the skill stays model-invocable and looks configured. That is a silent success, and
it is what the guard now names. When Claude Code documents a new key, add it to the list.

## 31. Two guard blind spots closed: a citation with no document, and a colour that is not hex

**Locked 2026-10-21.**

Both are the same failure #16 names: a check that passes because it never looked.

**Citations.** The guard resolved `NN §N`, so a bare `§N` was invisible to it, and a playbook
shipped citing a "section 5a" with no document — and no such section anywhere. In a framework file (anything
under `.agents/`, a directory's `AGENTS.md`, `plan/`, `docs/DECISIONS.md`, and code), a bare `§N`
now resolves against the document its line names — before it, or as "§N of `NN-NAME.md`" after it —
or, inside a rulebook file, against that file. One that resolves against nothing fails. A project's
own prose is left alone: a section mark in a contract or a spec is not a rulebook citation.

**Colours.** #1's rule is "no hardcoded colour", and the guard checked only hex, so `color: white`
and `rgb(0 0 0)` passed it.

> A literal colour outside `tokens.scss` fails `guard`: a hex, a colour function that does not wrap
> a `var()`, or a named colour as the value of a colour property.

A colour function over a `var()` is a token being adjusted, not a literal. A named colour counts
only as a colour property's value, because `tan` and `linen` mean nothing anywhere else.

## 32. A playbook's instructions are checked like code, and the templates are run

**Locked 2026-10-21.**

2.0.0 shipped three playbooks telling an agent to copy from templates that did not exist —
`new-api-call` from `.agents/templates/api/`, `new-component` from `component/`, `new-feature`
from `INDEX.feature.md` — and the API template they meant, once found, failed `npm run verify`
four times: three `../` imports its own lint rule rejects (`01 §6`), and a `select` option that
`useMutation` does not have. Every guard was green. #31 named this shape, a check that passes
because it never looked, and closed it for one spelling of a citation. These were the others.

> A framework path named in a playbook, a template, the rulebook or an index exists, in that exact
> case. A `rule NN N` citation resolves the way `NN §N` does. The code in `.agents/templates/` is
> type-checked and linted inside an installed scaffold by the framework's CI.

**Case-exact, not `existsSync`.** macOS and Windows answer yes to `INDEX.md` when the file is
`index.md`, so a path that is right only there would pass two thirds of the CI matrix and fail the
third. A guard must not depend on where it ran (#22).

**`rule NN N` is the form the routing tables use** — every row of `00-INDEX.md`'s "which section
answers which question", the root guide, every layer index — and it carries no `§` for the other
checks to see. It counts only after `cli.mjs `, `npm run ` or a backtick, so a project's prose
about rule 12 of a lease is not a citation.

**The templates are run where they are used**, not against a fixture. `bin/check-templates.mjs`
writes each block into an installed scaffold, stubs phase 01's modules at the paths the templates
import, and lets the project's own tsc, eslint and styles guard judge it. It is #21's lesson one
level down: prose cannot be run, so run the code inside it. It is the framework's check, not a
project's — `bin/` never reaches one.

Two false positives went at the same time, because a check that fires on correct code is the one
that gets deleted (#22). The class-map check understood `&__el` and `&--mod` only one level under a
top-level block, so an element's own modifier (`&__row { &--active }`), `&-icon` and `.card .title`
failed on correct stylesheets; it now resolves `&` at any depth. And a hex in a trailing `//`
comment counted as a colour; a line comment is now prose wherever it starts.

## 33. The CLI's Node floor is 22.2, and every entry point says so before it fails

**Locked 2026-10-21.**

`package.json` promised Node `>=20.11`. On Node 20 the CLI's named `globSync` import failed at link
time, before a line of it ran, with a `SyntaxError` naming neither the version nor the fix — and
`hooks` is the postinstall, so `npm install` failed with it in every project made from this.

> The checks that use `fs.globSync` — `check`, `sync`, `update` — refuse on Node older than 22.2
> with the version and the fix. `rule` and `hooks` need nothing newer and run on Node 20, so an
> older Node never fails `npm install`. The scaffolder refuses before it writes a file.

The tempting fix was an `engines` field in every project's `package.json`. It was left out: npm
only warns on it, and a host that reads it to choose a runtime takes the newest major an open `>=`
range allows — a deploy setting the template has no business making for a project.

The scaffolder's input had the same failure in three places, each found by running it: a project
named `Bob's Shop` was written into JSX as text and failed `react/no-unescaped-entities` on its
first `npm run verify`; `--name "My App"` with a space was dropped, and the project named after its
directory; and an unknown flag was ignored, so `--skip-instal` ran the whole install. A name is now
a string literal, both flag spellings work, and an unknown flag is refused with the list of known
ones.

## 34. The framework's decisions live in `.agents/docs/`; a project's are its own, numbered from 1

**Locked 2026-10-21.** Supersedes the shared numbering this record's header described before —
"1–N are the framework's, N+1 onwards are yours" — and #18's silence on where this file lives.

This record used to be `docs/DECISIONS.md`, copied into a project once and then the project's,
while the framework kept appending to the same number sequence. So the two collided. A project made
on 1.0.0, when the framework's entries were 1–25, numbered its own from 26; 2.0.0 then shipped a
rulebook citing `docs/DECISIONS.md #26` to `#31`, and in that project every one of those citations
pointed at the project's own reasoning — read confidently, about the wrong decision. And the new
entries never arrived at all: `update` writes only under `.agents/` (#18), so the advice was to copy
them in by hand, renumbered, which broke the citations a second way.

> The framework's decisions are `.agents/docs/DECISIONS.md`, mirrored by every update. A
> project's are `docs/DECISIONS.md`, starting empty and numbered from 1. A citation names its
> record — `.agents/docs/DECISIONS.md #N` or `docs/DECISIONS.md #N` — and `guard` fails one that
> does not resolve, and, in a framework file, a bare `DECISIONS.md #N` that names neither.

**In `docs/`, not at the top of `.agents/`, because of who runs the update.** It was
`.agents/DECISIONS.md` first, and moving a real 2.0.0 project onto it left the file missing: the
updater that runs is the project's *old* `cli.mjs`, which copies the files its own release knew
of. Every updater ever shipped mirrors `.agents/docs/`, so here it arrives from any version. The
updater now copies whatever the incoming `.agents/` holds instead of a list, so the next new file
arrives on its first update rather than its second. And the layout already said this: the
framework's documents are in `.agents/docs/`, a project's in `docs/`.

**Reserving a block was the cheaper-looking fix, and it was wrong twice.** Framework 1–99 and
projects 100+ would have collided with every project already numbering from 26 or 32 inside the
block, and the framework's file would still have been one `update` cannot reach — new entries
stranded in the template, which was half the bug.

**Nothing was renumbered.** Entries 1–33 keep their numbers, because those are addresses in commit
messages and code comments; only the file they are addressed in moved. A project's own entries keep
theirs too: the migration deletes the framework's copies from `docs/DECISIONS.md` and leaves the
rest where they stand, gaps and all. The guard is the migration — a citation to an entry that
moved now fails, naming the file to point at instead.

**A decision record is history,** so the guard checks citations *into* one, never the text inside
it: an entry's old paths and old file names are what was true when it was written.

## 35. The import firewall names every folder's root, covers class maps, and is proven both ways

**Locked 2026-10-21.**

The lint zones were the one enforcement nothing tested, and they are what makes "a feature never
imports another feature" (#8) and "nothing outside `server/` imports `server/`" (#10) true. Asked
twenty-five imports it should answer one way or the other, the 2.0.0 config got six wrong. Each
zone listed the paths *inside* a folder and not the folder, so `@/features/billing` — a feature's
index, the most natural import there is — and `@/server` passed. And every `*.classes.ts` crossed
the whole firewall: the block exempting class maps from the stylesheet rule came last, and a later
flat-config block replaces a rule rather than merging it — the trap the config's first comment
names, sprung by the config itself.

> Every zone names a folder's root as well as its contents. Every zone is written twice — for its
> files, and for the class maps inside it, which lose the stylesheet rule and nothing else. The
> framework's CI imports across every zone inside an installed scaffold (`bin/check-lint.mjs`) and
> fails on any answer that differs from the rulebook.

`core/i18n/messages.ts` keeps its one exception, a feature's strings, and loses the one it never
needed: it reached `server/` too. `src/proxy.ts` is allowed where `src/middleware.ts` was, because
Next 16 renamed the file.

Two false positives in `guard` went at the same time (#22). An id spelled in hex digits —
`#add-button` — failed as the colour `#add`; selectors are now blanked before the scan, across
lines, which keeps a gradient's colours on lines of their own in view. And the class-map parser
read a `{` inside a string as a block and `@at-root` as an at-rule.

## 36. A scaffold installs exact versions — the set CI last proved

**Locked 2026-10-21.** Sharpens "a tested combination" in `05 §3`, which described the majors only.

The scaffolder pinned `create-next-app` and gave every other dependency a caret range, so each new
project resolved whatever was newest that day: a pin reading Next 16.3.4 installed 16.4.2, and
nothing had run that combination until somebody's project did.

> `DEPS` and `DEV_DEPS` in `bin/create.mjs` are exact versions, and `create-next-app` is the same
> version as `next`. Bumping one is an edit here, and the scaffold job in CI is what proves it.

Exact, not merely narrower, because a range is a promise the framework cannot test — and it is
what `create-next-app` itself writes. A project moves on from the pinned set the usual way, under
its own lockfile; transitive dependencies still float until its first `npm install` writes one.

## 37. A playbook names its arguments; a positional `$N` fails the guard

**Locked 2026-10-21.**

Claude Code counts skill arguments from zero — `$0` is the first, `$1` the second — and substitutes
them anywhere in the body, code blocks included. Nine playbooks were written as if `$1` were the
first. Every one of them received the wrong value without a word: `/new-component InvoiceRow
shared` read `$1` as `shared` and `$2` as nothing, so it built `components/shared/`.

> A playbook that takes input declares it in `arguments:` and writes `$name` in its body. `guard`'s
> agents check fails a body holding a bare `$N`, and `sync:agents` will not mirror over it. A
> literal dollar is escaped, `\$1`.

Named, not renumbered to `$0`: a name reads the same in both agents. Codex substitutes nothing, so
it sees `$component` beside a line saying what that is, which is what it saw for `$1` before. A
renumbered `$0` would have read as a typo there and stayed one wrong digit away from the bug.
Placeholders are kept clear of identifier characters — `Create<Form>InputSchema`, not
`Create$formInputSchema` — because a name glued to letters is a different name.

`update-framework` is also gated now (`disable-model-invocation: true`): it switches branches and
rewrites `.agents/`, which is what the flag is for. Its body says so too, because Codex ignores the
flag (#26, `05 §4`).

## 38. Claude Code's own enforcement: two hooks, a deny on `.agents/`, a shim it can read

**Locked 2026-10-21.**

The guards ran at commit and in CI; inside a Claude Code session they ran only when the agent
remembered to. Claude Code documents hooks for exactly this — what must happen every time — and
permission rules for what must never happen. The rulebook said both things in prose.

> `.claude/settings.json` runs two hooks. After an `Edit` or `Write`, `check --only=agents`; when the
> agent stops, `check --only=plan`. Both pass `--hook`, which makes a failure exit 2 — the only
> code Claude Code shows the agent — and a pass print nothing. A Stop the hook already sent back
> once is let go; the pre-commit hook and CI still hold the line.
>
> A scaffolded project's settings deny `Edit(/.agents/**)` and `Edit(/.claude/skills/**)`. The
> scaffolder writes the deny, because the framework's own copy is where `.agents/` is edited.

Only those two checks. `plan` is what drifts inside one session and costs most to rebuild later
(#24). `agents` is what a single edit can break — a canonical skill edited where the mirror is a
copy. `docs` and `styles` fire on half-finished work, and a check that fires on correct work gets
deleted (#22). The hooks run `node` with the script path as an argument, not a shell line: that
is what works on Windows whether Claude Code reaches it through Git Bash or PowerShell.

The deny stops the agent's file tools, not `update` or `sync`, which write through node. So the
framework still updates itself, and an agent asked to edit `.agents/` in a project gets a refusal
in place of a change the next update would quietly undo.

The `CLAUDE.md` shim's fallback line was an HTML comment, and Claude Code strips those from a
`CLAUDE.md` before loading it. So the one case it was written for, an import that did not
expand, was the one case in which nothing showed it. It is plain text now. Existing shims are
never overwritten (#14), so a project replaces its own.
