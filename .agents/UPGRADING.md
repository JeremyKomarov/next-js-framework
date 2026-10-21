# Upgrading the framework

**Newest first.** One entry per framework version, and only what a project has to *do* — the
changelog of the framework's own files is `git log`. `npm run update:framework` prints every entry
above the version you were on.

Most updates need nothing: the guards are the migration. A new rule arrives as a `npm run verify`
failure that names the file and the section. An entry here is for the rest — a rename that a guard
cannot see, a convention that changed meaning, a file your project must now write itself.

Format: `## <version> — <date>`, then **Do:** lines, or "Nothing — `npm run verify` covers it."

## 3.1.1 — 2026-10-21

The kit's CI workflow used `actions/checkout@v4` and `actions/setup-node@v4`, which target Node 20.
GitHub has deprecated Node 20 for actions and warns on every run. The kit now uses `@v7` of both.

**Do:**

- **`.github/workflows/verify.yml`: change `actions/checkout@v4` to `@v7`, and
  `actions/setup-node@v4` to `@v7`.** `update` cannot reach `.github/`. Nothing else in the
  file changes; `cache: npm` still works.

## 3.1.0 — 2026-10-21

Nine playbooks read their arguments one place late in Claude Code, which counts `$N` from zero:
`/new-component InvoiceRow shared` built `components/shared/`. They name their arguments now, and
the guard fails a bare `$N` (`.agents/docs/DECISIONS.md` #37). Claude Code now runs two guards
itself, through hooks, and a project's settings refuse edits to `.agents/` (#38). Settings and
shims live outside `.agents/`, so `update` cannot write them; the steps below are by hand.

**Do:**

- **`.claude/settings.json`: add the `$schema` line and the `hooks` block** from the framework's
  copy. They run `check --only=agents --hook` after each edit and `check --only=plan --hook` when
  the agent stops. Keep your own `allow` entries.
- **Add a `deny` to its `permissions`:** `["Edit(/.agents/**)", "Edit(/.claude/skills/**)"]`.
  `update` and `sync` write through node and are not affected.
- **Replace every `CLAUDE.md` that is still the stock shim:** delete it and run
  `npm run sync:agents`. The old fallback line was an HTML comment, and Claude Code strips those
  before loading. A shim you added imports to: replace just the comment with the two lines in
  `SHIM` in `.agents/cli.mjs`.
- **A playbook of your own that uses `$1`, `$2`** now fails `npm run verify`. Name the arguments
  (`arguments: [name]`, then `$name`), or escape a literal dollar as `\$1`.
- **`/update-framework`** has to be typed now. Claude Code no longer starts it on its own.

## 3.0.0 — 2026-10-21

Breaking: the framework's decisions moved to `.agents/docs/DECISIONS.md`, and `docs/DECISIONS.md`
is now only yours (`.agents/docs/DECISIONS.md` #34). The two used to share one number sequence, so
the rulebook's citations could land on your own entries. And the import firewall had side doors —
a feature's root, `@/server`, and every class map (#35). `update` cannot reach `docs/`, your root
`AGENTS.md` or your root `eslint.config.mjs`, so the first four steps are by hand. Also: the
playbooks pointed at templates that did not exist, and the API template failed its own lint and
typecheck — both fixed, and the guard now checks what let them through.

**Do:**

- **`docs/DECISIONS.md`: delete the framework's entries, keep yours with their numbers.** Your
  header names the framework's range — 1–25 if the project started on 1.0.0, 1–31 on 2.0.0. They
  are all in `.agents/docs/DECISIONS.md` now, unchanged. Replace the header's "Entries 1–N are the
  framework's" paragraph with: "The framework's decisions are `.agents/docs/DECISIONS.md`.
  Entries here are this project's, and start at #N." Never renumber yours.
- **Root `AGENTS.md`: replace the "Full record:" paragraph** under "Decisions already made" with
  the one in `.agents/templates/root-guide.md`, which names both records.
- **Copy the kit's ESLint config again:** `cp .agents/kit/eslint.config.mjs eslint.config.mjs`.
  If you changed yours, port the fix instead: every zone names its folder's root (`@/features/x`,
  `@/server`) as well as `…/*`, and each zone is repeated for the `*.classes.ts` files inside it —
  read `restrict()` in the kit's copy. Then `npm run lint`: an import that went through a side door
  now fails. Promote what two features share (the `promote` playbook) rather than allowing it.
- **Run `npm run verify` and fix each decision citation it names.** A bare `DECISIONS.md #N` in
  an `AGENTS.md`, a `plan/` file or code now fails: write `.agents/docs/DECISIONS.md #N` if it
  meant the framework's, `docs/DECISIONS.md #N` if yours. A `docs/DECISIONS.md #N` whose entry
  you just deleted fails too, and the message names its new address. Comments in
  `.github/workflows/verify.yml` are not checked; fix them the same way.
- **Use Node 22.2 or newer.** `guard`, `sync` and `update` refuse anything older and say so; they
  crashed on it before. `rule` and `hooks` still run on Node 20, so `npm install` is unaffected.
- **Check any mutation hook you built from `.agents/templates/api.md`** for a `select:` option.
  `useMutation` has none, so it was a type error — or, cast away, handed components a DTO. Map in
  `mutationFn` instead: `mutationFn: async (input) => mapXDto(await createX(input))`.
- **The template imports `toApiError` from `@/core/api/api-error`.** If yours lives in
  `core/api/http-error.ts`, keep it and fix the import when you copy the template.
- **Expect new `npm run verify` failures, and fix them where they point:** a `rule NN N` citation
  to a section that does not exist, or a `.agents/…` path that does not — in that exact case — in
  an `AGENTS.md` or a playbook of your own. Old false positives are gone: nested BEM such as
  `&__row { &--active {} }`, a hex inside a trailing `//` comment, an id spelled in hex digits
  (`#add-button`), a `{` inside a string, and `@at-root`.
- **Commit the mode change on `.agents/kit/hooks/pre-commit`** if the update shows one — it now
  ships executable. It shipped without the bit, so an update copied a non-executable hook over
  yours, and git skips one of those with only a hint: the plan check stopped running on commit
  until the next `npm install`.

## 2.0.0 — 2026-10-21

Breaking: three agents are no longer supported, and files outside `.agents/` need changing by
hand — `update` cannot reach them.

**Do:**

- **Delete the Cursor, Gemini CLI and opencode wiring** (`.agents/docs/DECISIONS.md` #26, like every
  `#N` in this entry), unless you will maintain it yourself — `sync:agents` no longer writes or
  checks it:
  `git rm -r --ignore-unmatch .cursor .gemini GEMINI.md`, plus any nested `GEMINI.md` beside a
  directory's `AGENTS.md` (`git ls-files '*GEMINI.md'`).
- **Root `AGENTS.md`: delete the generated playbook list** — from `<!-- playbooks:start -->` to
  `<!-- playbooks:end -->`, and the "Generated by `npm run sync:agents`" line under it. Both agents
  list skills natively, and nothing maintains the list any more.
- **Add CI if you have none** (#28): `mkdir -p .github/workflows && cp .agents/kit/ci/verify.yml
  .github/workflows/verify.yml`. It runs `npm ci`, so commit `package-lock.json`.
- **Add `.claude/settings.json` if you have none** — copy it from the framework repository. It lets
  `rule`, `guard` and `verify` run without a permission prompt.
- **The shared kit is no longer a fixed ten** (#27). If phase 02 still lists primitives you have not
  built, re-plan it with the `plan-kit` playbook. A kit already built needs nothing.
- **`docs/DECISIONS.md` is yours, so it was not updated.** Framework entries 26–31 are new. Do
  not copy them in — 3.0.0 moved the framework's record to `.agents/docs/DECISIONS.md`, where they
  arrive with the update.
- **Expect new `npm run verify` failures, and fix them in your code** (#30, #31): a literal colour
  that is not hex — `rgb(…)`, `white` — outside `tokens.scss`; a `§N` with no document number in an
  `AGENTS.md`, a `plan/` file or a code comment (write `NN §N`); and a skill frontmatter key that
  Claude Code does not document — usually a misspelling.

## 1.0.0 — 2026-09-05

First version. Nothing to do.
