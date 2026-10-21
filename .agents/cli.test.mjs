// The guard, guarded.
//
//   node --test .agents/            npm test
//
// DECISIONS.md #16: "A guard that passes because it scanned nothing is worse than no guard. When
// a glob's root moves, prove the guard still fails on a real break before believing it passes."
// That was written after a refactor silently removed the whole rulebook from every check and all
// four printed "clean". Until this file existed the proof was a person running it by hand once.
//
// Every test builds a throwaway project, breaks exactly one thing, and asserts the guard names
// it. The positive cases matter as much: a check that fires on a *correct* project gets disabled
// within a week, so the empty project and the false-positive regressions are tested too.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync, mkdirSync, writeFileSync, rmSync, cpSync, readFileSync, existsSync, readdirSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const FRAMEWORK = dirname(fileURLToPath(import.meta.url));   // .agents/, beside this file

// ---------------------------------------------------------------- the fixture
const PLAN_INDEX = (status = "not started", now = "01") => `# Plan

| # | Phase | Status | File |
|---|---|---|---|
| 01 | Foundation | ${status} | [01-foundation.md](01-foundation.md) |

**Now:** ${now} · **Next:** —
`;

const PHASE = (status = "not started", steps = "- [ ] 01.1 — do the thing (S)") =>
  `# 01 — Foundation\n\n**Status:** ${status}\n\n## Steps\n${steps}\n`;

const NOW = (step = "—", extra = "**Since:** —\n**State:** nothing in flight.\n") =>
  `# Now\n\n**Step:** ${step}\n${extra}`;

const SKILL = (name, frontmatter = "") =>
  `---\nname: ${name}\ndescription: Does ${name}. Use when you need ${name}.\n${frontmatter}---\n\n# ${name}\n`;

/** A project the guard is happy with, that each test then breaks in exactly one place. */
function project(files = {}) {
  const root = mkdtempSync(join(tmpdir(), "guard-test-"));
  // package.json is what projectRoot() locks onto — without it the CLI walks out of the fixture.
  write(root, "package.json", `{ "name": "fixture", "private": true }\n`);
  mkdirSync(join(root, ".agents"), { recursive: true });
  cpSync(join(FRAMEWORK, "cli.mjs"), join(root, ".agents/cli.mjs"));
  cpSync(join(FRAMEWORK, "docs"), join(root, ".agents/docs"), { recursive: true });

  write(root, "plan/00-INDEX.md", PLAN_INDEX());
  write(root, "plan/01-foundation.md", PHASE());
  write(root, "plan/NOW.md", NOW());
  write(root, "AGENTS.md", "# fixture\n");
  write(root, "CLAUDE.md", "@AGENTS.md\n");

  for (const [path, body] of Object.entries(files)) {
    if (body === null) rmSync(join(root, path), { recursive: true, force: true });
    else write(root, path, body);
  }
  return root;
}

function write(root, path, body) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), body);
}

/** Runs a CLI command in the fixture. Never throws — the exit code is the thing under test. */
function cli(root, ...args) {
  try {
    const stdout = execFileSync(process.execPath, [join(root, ".agents/cli.mjs"), ...args],
      { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, out: stdout, all: stdout };
  } catch (e) {
    return { code: e.status ?? 1, out: e.stdout ?? "", all: (e.stdout ?? "") + (e.stderr ?? "") };
  }
}

const clean = (root, ...only) => cli(root, "check", ...only);

/** Asserts the guard failed AND said why — a failure with the wrong message is a failure to fix. */
function fails(root, needle, ...only) {
  const r = clean(root, ...only);
  assert.equal(r.code, 1, `expected the guard to fail, it exited ${r.code}:\n${r.all}`);
  assert.ok(r.all.includes(needle), `expected a message containing "${needle}", got:\n${r.all}`);
  return r;
}

function passes(root, ...only) {
  const r = clean(root, ...only);
  assert.equal(r.code, 0, `expected the guard to pass, it exited ${r.code}:\n${r.all}`);
  return r;
}

const cleanup = [];
test.after(() => { for (const d of cleanup) rmSync(d, { recursive: true, force: true }); });
const fixture = (files) => { const r = project(files); cleanup.push(r); return r; };

// ============================================================== the empty project
// "A guard that fails on an empty project is a guard people delete" — 05-WORKFLOW.md §3. This is
// the check on that promise, and it is the one most likely to break as checks are added.
test("a project with nothing in it passes every check", () => {
  const root = mkdtempSync(join(tmpdir(), "guard-empty-"));
  cleanup.push(root);
  write(root, "package.json", `{ "name": "empty" }\n`);
  mkdirSync(join(root, ".agents"), { recursive: true });
  cpSync(join(FRAMEWORK, "cli.mjs"), join(root, ".agents/cli.mjs"));

  const r = cli(root, "check");
  assert.equal(r.code, 0, `an empty project must pass:\n${r.all}`);
  assert.ok(r.out.includes("nothing to check"), `expected the checks to say they skipped:\n${r.out}`);
});

test("the seeded fixture passes, or every negative test below proves nothing", () => {
  passes(fixture());
});

// `--only plan` with a space used to be dropped silently, and every check ran.
test("check: --only takes its value with = or with a space, and refuses none", () => {
  const root = fixture();
  for (const args of [["--only=plan"], ["--only", "plan"]]) {
    const r = clean(root, ...args);
    assert.equal(r.code, 0, r.all);
    assert.match(r.out, /plan/);
    assert.ok(!r.out.includes("docs"), `expected only the plan check to run for ${args.join(" ")}:\n${r.out}`);
  }
  assert.equal(clean(root, "--only").code, 2);
});

// ===================================================================== check: plan
test("plan: a phase in progress with no [~] step fails", () => {
  fails(fixture({
    "plan/00-INDEX.md": PLAN_INDEX("in progress"),
    "plan/01-foundation.md": PHASE("in progress"),
  }), "no step is marked [~]", "--only=plan");
});

test("plan: a [~] step under a phase that is not in progress fails", () => {
  fails(fixture({
    "plan/01-foundation.md": PHASE("not started", "- [~] 01.1 — do the thing (S)"),
  }), "makes its phase", "--only=plan");
});

test("plan: a done step that is not struck through fails", () => {
  fails(fixture({
    "plan/00-INDEX.md": PLAN_INDEX("done"),
    "plan/01-foundation.md": PHASE("done", "- [x] 01.1 — do the thing (S)"),
  }), "not struck through", "--only=plan");
});

test("plan: two steps in flight at once fails", () => {
  fails(fixture({
    "plan/00-INDEX.md": PLAN_INDEX("in progress"),
    "plan/01-foundation.md": PHASE("in progress",
      "- [~] 01.1 — one (S)\n- [~] 01.2 — two (S)"),
    "plan/NOW.md": NOW("01.1", "**Since:** 2026-09-05\n**State:** started.\n"),
  }), "one step at a time", "--only=plan");
});

test("plan: NOW.md naming a step but saying nothing about it fails", () => {
  fails(fixture({
    "plan/00-INDEX.md": PLAN_INDEX("in progress"),
    "plan/01-foundation.md": PHASE("in progress", "- [~] 01.1 — do the thing (S)"),
    "plan/NOW.md": NOW("01.1", "**Since:** —\n**State:** —\n"),
  }), "is empty while 01.1 is in flight", "--only=plan");
});

test("plan: a phase file with no index row fails", () => {
  fails(fixture({ "plan/02-extra.md": PHASE() }), "not listed", "--only=plan");
});

test("plan: a fully marked-up in-flight phase passes", () => {
  passes(fixture({
    "plan/00-INDEX.md": PLAN_INDEX("in progress"),
    "plan/01-foundation.md": PHASE("in progress", "- [~] 01.1 — do the thing (S)"),
    "plan/NOW.md": NOW("01.1", "**Since:** 2026-09-05\n**State:** half done.\n"),
  }), "--only=plan");
});

// ===================================================================== check: docs
test("docs: a citation to a section that does not exist fails", () => {
  fails(fixture({ "src/note.md": "See 02-COMPONENTS.md §99 for this.\n" }),
    "which has no such section", "--only=docs");
});

test("docs: a citation to a rulebook file that does not exist fails", () => {
  fails(fixture({ "src/note.md": "See 09-NOPE.md §1.\n" }), "does not exist", "--only=docs");
});

// The bug this check was written for: the 12-to-5 merge left `docs/10-PLANNING.md` linked from
// the seeded plan index, and the §-only check could not see a link with no § in it.
test("docs: a link to a merged-away rulebook file fails, even with no § in it", () => {
  fails(fixture({ "plan/00-INDEX.md": PLAN_INDEX() + "\nSee [sizing](../.agents/docs/10-PLANNING.md).\n" }),
    "10-PLANNING.md, which does not exist", "--only=docs");
});

test("docs: a feature with no AGENTS.md fails", () => {
  fails(fixture({ "src/features/billing/index.ts": "export {};\n" }),
    "has no AGENTS.md", "--only=docs");
});

test("docs: a valid citation in any file type passes", () => {
  passes(fixture({
    "src/note.md": "See 02-COMPONENTS.md §7, and .agents/docs/03-DATA.md §1, and 01 §4.\n",
    "src/thing.ts": "// 05-WORKFLOW.md §2\n",
  }), "--only=docs");
});

// The bug this was written for: a playbook cited "(§5a)" — no document, and no such section in
// any of them — and the full-citation check could not see it (DECISIONS.md #31).
test("docs: a § with no document named fails in a framework file", () => {
  fails(fixture({ ".agents/skills/thing/SKILL.md": SKILL("thing") + "\nRelease it upstream (§5a).\n" }),
    "§5a names no document", "--only=docs");
});

test("docs: a § resolved against the document its line names must exist there", () => {
  fails(fixture({ "AGENTS.md": "# fixture\n\nSee 05-WORKFLOW.md, and then §99.\n" }),
    "§99 resolves to 05-WORKFLOW.md, which has no such section", "--only=docs");
});

test("docs: a § that names its document before or after it, or sits in a rulebook file, passes", () => {
  passes(fixture({
    "AGENTS.md": "# fixture\n\nnode .agents/cli.mjs rule 02 7   # §7, and nothing else\n" +
                 "This is the failure §2 of `05-WORKFLOW.md` prevents.\n" +
                 "See [`05-WORKFLOW.md`](.agents/docs/05-WORKFLOW.md) §2.\n",
    // A project's own prose may use § for its own sections; only framework files are held to it.
    "src/legal/terms.md": "Clause §14 applies.\n",
  }), "--only=docs");
});

// The skip list used to be a substring test, so any path merely containing ".next" or ".git" —
// this file — was never read at all.
test("docs: a file whose name only contains .next is still checked", () => {
  fails(fixture({ "src/notes.next-steps.md": "See 02-COMPONENTS.md §99.\n" }),
    "which has no such section", "--only=docs");
});

// Claude Code reads CLAUDE.md, not AGENTS.md — a nested index with no shim is invisible to it.
test("docs: an AGENTS.md with no CLAUDE.md beside it fails, and sync writes it", () => {
  const root = fixture({ "src/shared/AGENTS.md": "# shared\n" });
  fails(root, "src/shared/CLAUDE.md  missing", "--only=docs");
  assert.equal(cli(root, "sync").code, 0);
  passes(root, "--only=docs");
});

test("docs: a CLAUDE.md pointing at a file that is not there fails", () => {
  fails(fixture({ "CLAUDE.md": "@NOPE.md\n" }), "which does not exist", "--only=docs");
});

// Codex cuts project docs off at 32 KiB with no error, so the root guide is held well under it.
test("docs: a root AGENTS.md too large for Codex to read whole fails", () => {
  fails(fixture({ "AGENTS.md": "# fixture\n\n" + "word ".repeat(6000) }), "Codex starts cutting", "--only=docs");
});

// =================================================================== check: styles
test("styles: a hardcoded colour outside tokens.scss fails", () => {
  fails(fixture({ "src/shared/Button.module.scss": ".button { color: #ff0000; }\n" }),
    "hardcoded colour", "--only=styles");
});

test("styles: tokens.scss may hold every hex it likes", () => {
  passes(fixture({ "src/core/styles/tokens.scss": ":root { --brand-500: #4f46e5; }\n" }), "--only=styles");
});

// Regression: `#fade` inside url() is four hex digits, and the naive match called an SVG filter
// reference a hardcoded colour. A guard that is wrong often enough gets ignored.
test("styles: url(#id), var() and block comments are not colours", () => {
  passes(fixture({
    "src/shared/Icon.module.scss": `/* #ff0000 in a block comment is prose */
.icon {
  filter: url(#fade);
  color: var(--text-primary);
  // #abcdef in a line comment
}
`,
  }), "--only=styles");
});

// Hex was the only spelling the check knew; these broke the same rule and passed (DECISIONS.md #31).
test("styles: a colour function outside tokens.scss fails", () => {
  fails(fixture({ "src/shared/Button.module.scss": ".button {\n  background: rgb(0 0 0 / 50%);\n}\n" }),
    "hardcoded colour rgb", "--only=styles");
});

test("styles: a named colour outside tokens.scss fails", () => {
  fails(fixture({ "src/shared/Button.module.scss": ".button {\n  border: 1px solid white;\n}\n" }),
    "hardcoded colour white", "--only=styles");
});

test("styles: keywords, a colour function over a var(), and non-colour properties pass", () => {
  passes(fixture({
    "src/shared/Badge.module.scss": `.badge {
  color: currentColor;
  background: transparent;
  border-color: color-mix(in srgb, var(--brand-500) 40%, transparent);
  box-shadow: 0 0 0 1px rgb(var(--shadow-rgb) / 20%);
  font-family: var(--font-sans);
  &:hover { outline: 2px solid var(--focus-ring); }
}
@media (min-width: 768px) { .badge { animation-name: tan; } }
`,
  }), "--only=styles");
});

test("styles: a class map naming a class the stylesheet does not define fails", () => {
  fails(fixture({
    "src/shared/Card/Card.module.scss": ".card { display: block; }\n",
    "src/shared/Card/Card.classes.ts":
      `import styles from "./Card.module.scss";\nexport const c = { root: styles["card"], ghost: styles["card--ghost"] };\n`,
  }), "is not a class in", "--only=styles");
});

test("styles: a class map matching its stylesheet, including BEM parts, passes", () => {
  passes(fixture({
    "src/shared/Card/Card.module.scss": ".card {\n  display: block;\n  &--ghost { opacity: 0.5; }\n  &__row { display: grid; }\n}\n",
    "src/shared/Card/Card.classes.ts":
      `import styles from "./Card.module.scss";\nexport const c = { root: styles["card"], ghost: styles["card--ghost"], row: styles["card__row"] };\n`,
  }), "--only=styles");
});

// =================================================================== check: agents
// Claude Code ignores a key it does not recognise, so a misspelling silently undoes what the key
// was for — this one would leave the skill model-invocable (DECISIONS.md #30).
test("agents: a frontmatter key Claude Code does not recognise fails", () => {
  const root = fixture({ ".agents/skills/thing/SKILL.md": SKILL("thing", "disable_model_invocation: true\n") });
  fails(root, "is not one Claude Code recognises", "--only=agents");
});

test("agents: documented frontmatter keys pass, including ones the old allowlist rejected", () => {
  const root = fixture({
    ".agents/skills/thing/SKILL.md": SKILL("thing",
      "when_to_use: Before a release.\nuser-invocable: false\npaths: src/**\nmetadata:\n  owner: team\n"),
  });
  assert.equal(cli(root, "sync").code, 0);
  passes(root, "--only=agents");
});

test("agents: a skill with no description fails", () => {
  const root = fixture({ ".agents/skills/thing/SKILL.md": "---\nname: thing\n---\n\n# thing\n" });
  fails(root, "has no description", "--only=agents");
});

test("agents: a missing Claude Code mirror fails, and sync repairs it idempotently", () => {
  const root = fixture({ ".agents/skills/thing/SKILL.md": SKILL("thing") });
  fails(root, ".claude/skills  missing", "--only=agents");

  assert.equal(cli(root, "sync").code, 0);
  passes(root, "--only=agents");
  assert.ok(existsSync(join(root, ".claude/skills/thing/SKILL.md")), "Claude Code must see the skill");

  const second = cli(root, "sync");
  assert.match(second.out, /already in sync/, `sync must be idempotent, second run said:\n${second.out}`);
});

test("agents: a copied mirror that drifts from the canonical skill fails", () => {
  const root = fixture({
    ".agents/skills/thing/SKILL.md": SKILL("thing"),
    ".claude/skills/thing/SKILL.md": SKILL("thing") + "\nstale line\n",
  });
  fails(root, "differs from", "--only=agents");
});

// A committed symlink checked out where symlinks are unavailable arrives as a one-line text file
// holding its own target. It looks present and contains no skills at all.
test("agents: a mirror checked out as a plain file fails, and sync repairs it", () => {
  const root = fixture({
    ".agents/skills/thing/SKILL.md": SKILL("thing"),
    ".claude/skills": "../.agents/skills",
  });
  fails(root, "is a file, not a directory", "--only=agents");
  assert.equal(cli(root, "sync").code, 0);
  passes(root, "--only=agents");
});

// ====================================================================== command: hooks
// hooksCmd() itself, plus proof the installed hook actually stops a commit — the guard passing
// is not evidence git ever runs it (DECISIONS.md #24).
function gitCmd(root, ...args) {
  try {
    const out = execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, all: out };
  } catch (e) {
    return { code: e.status ?? 1, all: (e.stdout ?? "") + (e.stderr ?? "") };
  }
}

/** The fixture has no .git of its own (project() predates git entirely) — this adds one, with the
 *  framework's hooks/ copied in, since only cli.mjs and docs/ are copied by default. */
function gitFixture(files) {
  const root = fixture(files);
  assert.equal(gitCmd(root, "init").code, 0);
  cpSync(join(FRAMEWORK, "kit/hooks"), join(root, ".agents/kit/hooks"), { recursive: true });
  return root;
}

const commit = (root, message) => gitCmd(root, "-c", "user.email=t@t.com", "-c", "user.name=t", "commit", "-m", message);

test("hooks: no .git — installs nothing and says so, rather than failing", () => {
  const root = fixture({});
  cpSync(join(FRAMEWORK, "kit/hooks"), join(root, ".agents/kit/hooks"), { recursive: true });
  const r = cli(root, "hooks");
  assert.equal(r.code, 0);
  assert.match(r.all, /not a git repository/);
});

test("hooks: no .agents/kit/hooks/ — installs nothing and says so", () => {
  const root = fixture({});
  assert.equal(gitCmd(root, "init").code, 0);
  const r = cli(root, "hooks");
  assert.equal(r.code, 0);
  assert.match(r.all, /nothing to install/);
});

test("hooks: points core.hooksPath at .agents/kit/hooks", () => {
  const root = gitFixture({});
  assert.equal(cli(root, "hooks").code, 0);
  const configured = gitCmd(root, "config", "core.hooksPath");
  assert.equal(configured.all.trim(), ".agents/kit/hooks");
});

test("hooks: the installed pre-commit hook blocks a commit that leaves the plan disagreeing", () => {
  const root = gitFixture({ "plan/NOW.md": NOW("01.1") });   // declares 01.1 in flight; no step is [~]
  assert.equal(cli(root, "hooks").code, 0);
  assert.equal(gitCmd(root, "add", "-A").code, 0);
  const r = commit(root, "break the plan");
  assert.notEqual(r.code, 0, `expected the hook to block this commit:\n${r.all}`);
  assert.match(r.all, /disagrees with itself|NOW\.md/);
});

test("hooks: the installed pre-commit hook allows a commit that leaves the plan consistent", () => {
  const root = gitFixture({});   // the seeded fixture is idle and self-consistent
  assert.equal(cli(root, "hooks").code, 0);
  assert.equal(gitCmd(root, "add", "-A").code, 0);
  assert.equal(commit(root, "a clean commit").code, 0);
});

// ====================================================================== command: rule
test("rule: with no arguments, lists every section and no bodies", () => {
  const r = cli(fixture(), "rule");
  assert.equal(r.code, 0, r.all);
  assert.match(r.out, /02 §7\s+Styling/);
  assert.match(r.out, /05 §2\s+Where the work is right now/);
  assert.ok(!r.out.includes("BEM inside the module"), "the map must not carry section bodies");
  assert.ok(!r.out.includes("00-INDEX"), "00-INDEX.md has no numbered section and is not addressable");
});

test("rule: one section prints that section and nothing after it", () => {
  const r = cli(fixture(), "rule", "02", "7");
  assert.equal(r.code, 0, r.all);
  assert.match(r.out, /^\.agents\/docs\/02-COMPONENTS\.md §7/);
  assert.ok(r.out.includes("BEM inside the module"), "expected §7's body");
  assert.ok(!r.out.includes("## 8."), "expected the print to stop at the next section");
});

test("rule: accepts '02 §7' as one argument, and -q searches", () => {
  const root = fixture();
  assert.ok(cli(root, "rule", "02 §7").out.includes("Styling"));

  const q = cli(root, "rule", "-q", "breakpoint");
  assert.equal(q.code, 0, q.all);
  assert.match(q.out, /02 §8/);
});

test("rule: an address that does not resolve exits non-zero and says what does", () => {
  const root = fixture();
  const badDoc = cli(root, "rule", "99");
  assert.equal(badDoc.code, 2, badDoc.all);
  assert.match(badDoc.all, /Known: 01, 02, 03, 04, 05/);

  const badSection = cli(root, "rule", "02", "99");
  assert.equal(badSection.code, 2, badSection.all);
  assert.match(badSection.all, /has no §99/);
});

// Every section the map advertises must actually print. A renamed heading that stops matching the
// `## N.` shape disappears from both, silently, and the citation check keeps passing.
test("rule: every advertised section is fetchable", () => {
  const root = fixture();
  const map = cli(root, "rule").out;
  const addresses = [...map.matchAll(/^\s+(\d\d) §(\d+[a-z]?)/gm)].map((m) => [m[1], m[2]]);
  assert.ok(addresses.length >= 30, `expected the whole rulebook in the map, got ${addresses.length}`);
  for (const [doc, section] of addresses) {
    const r = cli(root, "rule", doc, section);
    assert.equal(r.code, 0, `rule ${doc} ${section} failed:\n${r.all}`);
    assert.ok(r.out.trim().length > 40, `rule ${doc} ${section} printed almost nothing`);
  }
});

// ===================================================================== command: update
// The one command that deletes files in somebody's project, and the one that had no test.
// 05-WORKFLOW.md §6.
const json = (v) => JSON.stringify(v, null, 2) + "\n";

/** A framework to update from: this CLI and rulebook, as a release that changes `kept`, adds
 *  `added`, drops `dropped`, and has an upgrade note above the project's version. */
function frameworkSource() {
  const src = mkdtempSync(join(tmpdir(), "framework-src-"));
  cleanup.push(src);
  mkdirSync(join(src, ".agents"), { recursive: true });
  cpSync(join(FRAMEWORK, "cli.mjs"), join(src, ".agents/cli.mjs"));
  cpSync(join(FRAMEWORK, "docs"), join(src, ".agents/docs"), { recursive: true });
  write(src, ".agents/skills/kept/SKILL.md", SKILL("kept") + "\nversion two\n");
  write(src, ".agents/skills/added/SKILL.md", SKILL("added"));
  write(src, ".agents/version.json", json({ version: "9.0.0", skills: ["added", "kept"] }));
  write(src, ".agents/UPGRADING.md", "# Upgrading\n\n## 9.0.0 — 2026-10-21\n\n**Do:** the new thing.\n\n" +
                                     "## 1.0.0 — 2026-09-05\n\nFirst version.\n");
  return src;
}

/** A committed project on 1.0.0, with a playbook of its own and a rulebook file since removed. */
function projectOnOldVersion() {
  const root = fixture({
    ".agents/skills/kept/SKILL.md": SKILL("kept"),
    ".agents/skills/dropped/SKILL.md": SKILL("dropped"),
    ".agents/skills/mine/SKILL.md": SKILL("mine"),
    ".agents/docs/06-OLD.md": "# Old\n\n## 1. Gone\n\nRemoved upstream.\n",
    ".agents/version.json": json({ version: "1.0.0", skills: ["dropped", "kept"] }),
    "src/app.ts": "export {};\n",
  });
  assert.equal(gitCmd(root, "init").code, 0);
  assert.equal(gitCmd(root, "add", "-A").code, 0);
  assert.equal(commit(root, "start").code, 0);
  return root;
}

const branchOf = (root) => gitCmd(root, "branch", "--show-current").all.trim();

test("update: replaces the framework's files, keeps the project's, touches nothing outside .agents/", () => {
  const root = projectOnOldVersion();
  const r = cli(root, "update", frameworkSource());
  assert.equal(r.code, 0, r.all);
  assert.equal(branchOf(root), "framework-update-9.0.0");

  const has = (p) => existsSync(join(root, p));
  assert.ok(!has(".agents/skills/dropped"), "a playbook the framework dropped must go");
  assert.ok(has(".agents/skills/mine/SKILL.md"), "a project's own playbook must never be touched");
  assert.ok(has(".agents/skills/added/SKILL.md"), "a playbook the framework added must arrive");
  assert.match(readFileSync(join(root, ".agents/skills/kept/SKILL.md"), "utf8"), /version two/);
  assert.ok(!has(".agents/docs/06-OLD.md"), "docs/ is mirrored — a rulebook file removed upstream goes");

  const version = JSON.parse(readFileSync(join(root, ".agents/version.json"), "utf8"));
  assert.equal(version.version, "9.0.0");
  assert.deepEqual(version.skills, ["added", "kept"]);

  assert.match(r.out, /## 9\.0\.0[\s\S]*the new thing/, `the notes above the old version must print:\n${r.out}`);
  assert.ok(!r.out.includes("First version"), "the notes at or below the old version must not");

  const touched = gitCmd(root, "status", "--porcelain").all.split("\n").filter(Boolean);
  assert.ok(touched.length > 0, "expected the update to change something");
  for (const line of touched) assert.match(line.slice(3), /^\.agents\//, `touched outside .agents/: ${line}`);
});

// `git checkout .` was the advice, and it left every file the update added behind.
test("update: the abort line it prints puts the project back exactly", () => {
  const root = projectOnOldVersion();
  const before = branchOf(root);
  const r = cli(root, "update", frameworkSource());
  assert.equal(r.code, 0, r.all);

  const line = r.out.split("\n").find((l) => l.includes("git checkout -- ."));
  assert.ok(line, `expected an abort line:\n${r.out}`);
  for (const step of line.trim().split(" && ")) {
    const [, ...args] = step.split(" ");
    const run = gitCmd(root, ...args);
    assert.equal(run.code, 0, `${step} failed:\n${run.all}`);
  }
  assert.equal(gitCmd(root, "status", "--porcelain").all.trim(), "", "nothing the update wrote may survive");
  assert.equal(branchOf(root), before);
  assert.equal(gitCmd(root, "branch", "--list", "framework-update-9.0.0").all.trim(), "");
});

test("update: refuses a dirty tree, and changes nothing", () => {
  const root = projectOnOldVersion();
  write(root, "src/wip.ts", "export {};\n");
  const r = cli(root, "update", frameworkSource());
  assert.equal(r.code, 1, r.all);
  assert.match(r.all, /working tree has changes/);
  assert.equal(gitCmd(root, "branch", "--list", "framework-update-9.0.0").all.trim(), "");
  assert.equal(JSON.parse(readFileSync(join(root, ".agents/version.json"), "utf8")).version, "1.0.0");
});

// ======================================================== the framework's own release
// Anything a project can notice is a release (05-WORKFLOW.md §7). The label and the newest upgrade
// note move together, or `update` prints the wrong notes and reuses an old branch name; and the
// skill list is what `update` deletes by, so a stale one strands a dropped playbook in projects.
test("release: version.json names the newest UPGRADING.md entry and every shipped skill", () => {
  const version = JSON.parse(readFileSync(join(FRAMEWORK, "version.json"), "utf8"));
  const newest = readFileSync(join(FRAMEWORK, "UPGRADING.md"), "utf8").match(/^## (\S+) — /m)?.[1];
  assert.equal(newest, version.version,
    `.agents/version.json says ${version.version} but UPGRADING.md's newest entry is ${newest}`);

  const shipped = readdirSync(join(FRAMEWORK, "skills"), { withFileTypes: true })
    .filter((e) => e.isDirectory()).map((e) => e.name).sort();
  assert.deepEqual(version.skills, shipped, "version.json's skills must be exactly .agents/skills/");
});
