# Upgrading the framework

**Newest first.** One entry per framework version, and only what a project has to *do* — the
changelog of the framework's own files is `git log`. `npm run update:framework` prints every entry
above the version you were on.

Most updates need nothing: the guards are the migration. A new rule arrives as a `npm run verify`
failure that names the file and the section. An entry here is for the rest — a rename that a guard
cannot see, a convention that changed meaning, a file your project must now write itself.

Format: `## <version> — <date>`, then **Do:** lines, or "Nothing — `npm run verify` covers it."

## 1.0.0 — 2026-09-05

First version. Nothing to do.
