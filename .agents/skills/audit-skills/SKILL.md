---
name: audit-skills
description: Check the playbook roster itself for overlap and drift - two skills solving the same problem, or a skill whose steps no longer match the rule they cite. Use before a release, or when the skill list has grown and it is no longer obvious which one to reach for.
---

# audit-skills

`sync-index` catches a directory's index drifting from its disk. `guard`'s `agents` check catches
a skill missing from a mirror, or a frontmatter key Claude Code silently ignores. Neither looks at
whether the playbooks themselves still make sense as a set — this is that check, and it is the
same "deliberately not mechanized" judgement call as `02 §5`'s "does `shared/` already have
something that does this," aimed at `.agents/skills/` instead of a component folder (`05 §3`).

The failure this catches is specific: a second playbook that overlaps an existing one is a bug,
not a convenience, for the same reason a second `Card` is (`01 §4`) — except the cost lands on
every agent that now has to guess which one applies, every time, forever.

## Steps

1. **List every skill.** `node .agents/cli.mjs rule` does not cover skills; list
   `.agents/skills/` and read each `<name>/SKILL.md`'s `description:` directly.
2. **Pairwise, ask: would the same real task plausibly trigger both?** Not "do these share a
   word" — read what each actually does. Two playbooks are overlapping if a person describing
   their task in one sentence could not tell which applies without reading both in full.
   - **Genuine overlap** → merge into one, covering the union of both `argument-hint`s, and
     delete the other, then `npm run sync:agents`. Update every place that named the deleted one
     — a playbook or `AGENTS.md` citing it, a phase note; a commit message cannot be updated, and
     is a person's job to find.
   - **Looks similar, isn't** (e.g. `new-component` vs `promote` — one creates, one relocates) →
     leave both, and consider whether either's description needs a sharper "when to use" so the
     next read tells them apart faster.
3. **For each skill, re-read it against what it cites** — a `NN §N` section, a file path, a
   convention. `guard` already proves the citation *resolves*; it cannot prove the section still
   *says what the skill assumes it says* after a rule changed meaning (the same gap
   `.agents/docs/DECISIONS.md #18` names for framework updates, one level down). This step is a
   read, not a grep.
4. **Check for a dead playbook** — one describing a workflow the project no longer has (a feature
   kind that was removed, a step that named a file deleted elsewhere). A skill nobody can trigger
   correctly anymore is worse than a missing one: it still answers confidently.
5. **Report findings before changing anything.** Merges and deletions are for a human to confirm
   — unlike `sync-index`'s missing/stale rows, there is no mechanical repair here; every finding
   in this playbook is a judgement call, not a fact to fix on sight.

## Done when

Every pair of skills has a reason to both exist that survives being said out loud, every
citation inside a `SKILL.md` still means what it did when written, and nothing in the roster
describes a workflow that no longer exists.
