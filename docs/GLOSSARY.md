# Glossary

Terms that do not mean what a newcomer would guess. Add one the first time someone has to ask.

**Index** — an `AGENTS.md` inside a directory, listing what lives there and when to use it. Tier 2
of the lookup system (`00-INDEX.md`). Not to be confused with `.agents/docs/00-INDEX.md`, which routes
between rulebook files, or `plan/00-INDEX.md`, which is the phase table of contents.

**Playbook** — a repeatable procedure in `.agents/skills/<name>/SKILL.md`, invoked as
`/<name>` in Claude Code and `$<name>` in Codex.

**Promotion** — moving something from a feature into `shared/` at the moment a second feature
needs it. Never a copy. See `01-STRUCTURE.md` §4 and the `promote` playbook.

**Shim** — a one-line `CLAUDE.md` beside an `AGENTS.md` that points Claude Code at it. Contains no
rules of its own, ever.

**Silent success** — anything that reports success without doing the work: a stub handler
returning 200, a mock nobody can see, a screen in nav that renders nothing real. The defect this
codebase's conventions mostly exist to prevent.

*(Add project terms below.)*
