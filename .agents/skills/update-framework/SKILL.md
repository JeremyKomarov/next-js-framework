---
name: update-framework
description: Pull a newer version of the framework into this project, safely - on a branch, only under .agents/, with the guards as the migration. Use when the framework has improved since this project started.
argument-hint: [path-or-git-url]
---

# update-framework

Enforces `05 §6`.

**Input:** `$1` — the framework's path or git URL. Optional after the first run; it is recorded in
`.agents/version.json`.

## Steps

1. **Commit or stash first.** The script refuses a dirty tree, and it is right to: the diff must be
   the update and nothing else.
2. `npm run update:framework -- $1`. It branches, copies only under `.agents/`, and stops. Read
   what it prints — the upgrade notes are the part no guard can tell you.
3. `npm run verify`. **Expect failures, and read them as the migration.** Each one names the file
   and the section that changed. Fix the project code, not the rule.
4. `git diff` and check three things:
   - nothing outside `.agents/` is in the diff — if something is, stop and say so;
   - no playbook of your own was removed (`.agents/skills/`), only ones the framework dropped;
   - the removed and changed docs are ones you can account for.
5. Commit the framework bump **and** the code it required as one commit, on the update branch.
6. If it goes badly: `git checkout . && git switch -`. Nothing of yours moved.

## Do not

- Edit anything under `.agents/` in a project to make an update fit. The next update overwrites it
  silently. Fix it in the framework repository and release it (§5a).
- Skip `npm run verify` because the diff looked small. The point of the update is the rules that
  changed, and they only speak through the guards.

## Done when

`npm run verify` is green on the update branch, `.agents/version.json` shows the new version, and
`git diff main --stat` touches your code only where an upgrade note or a guard failure required it.
