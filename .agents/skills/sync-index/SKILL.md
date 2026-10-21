---
name: sync-index
description: Check a directory index against what is actually on disk and report or repair the drift. Use during review, or when an index looks stale.
argument-hint: [directory]
arguments: [directory]
---

# sync-index

The anti-rot playbook. `guard` can prove an index *exists*; it cannot prove the index is
still **true**. This is that check. See `05 §3`.

**Input:** `$directory` — a directory with an `AGENTS.md`. Omit it to check every one.

## Steps

1. Read `$directory/AGENTS.md` — or each `AGENTS.md` in turn, if none was given — and list the
   rows or bullets in its inventory.
2. List what is actually on disk in that directory.
3. Report three kinds of drift, separately:
   - **Missing rows** — a file with no entry. Invisible to the next agent; this is the one that
     causes duplicate components.
   - **Stale rows** — an entry whose file is gone. Worse than missing, because it reads as real.
   - **Wrong rows** — an entry whose description no longer matches the file. Open the file and
     compare; this needs reading, not globbing.
4. For a feature index also check: is `## Status` still true (are those endpoints still live, is
   one now built)? Is `## Next real work` still the next real work, or was it done three phases
   ago?
5. **Repair what is mechanical** — add missing rows, delete stale ones. For a `shared/` component,
   fill all four columns and write `Replaces` as a prohibition.
6. **Report what is not.** A row whose description is subtly wrong needs a human's judgement
   about what the component is *for*. Say what you found and what you would write; do not
   silently rewrite a description you had to guess at.

## Done when

Every file has a row, every row has a file, and anything requiring judgement is reported rather
than guessed. Run this before a release, and any time an index has not changed in a while but the
directory has.
