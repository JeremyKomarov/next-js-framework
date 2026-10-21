#!/usr/bin/env node
// The framework's one script: four checks, the rule reader, the skill sync, and the updater.
// Rules live in .agents/docs/05-WORKFLOW.md §3; this is what makes them fail.
//
//   node .agents/cli.mjs rule [NN] [N]                            npm run rule
//   node .agents/cli.mjs check [--only=plan,docs,styles,agents]   npm run guard
//   node .agents/cli.mjs check --only=… --hook                    Claude Code's hooks, settings.json
//   node .agents/cli.mjs sync                                     npm run sync:agents
//   node .agents/cli.mjs update [path-or-url] [--no-branch]       npm run update:framework
//   node .agents/cli.mjs hooks                                    npm run hooks (also postinstall)
//
// Dependency-free. Every check exits 0 with a message when its target does not exist yet — a
// guard that fails on an empty project is a guard people delete.
//
// Paths and line endings are normalised before anything is compared (05-WORKFLOW.md §4). Without
// that this reported a complete skill mirror as ten missing files on Windows, then crashed
// repairing it.
//
// node:fs is imported whole, not by name: a named import of globSync fails at link time on Node
// 20, before a line of this file runs, with a SyntaxError naming neither the version nor the fix
// — and `hooks` is the postinstall, so that crash failed `npm install` itself. See NODE_MIN.
import * as fs from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join, resolve, dirname, relative, parse, sep, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const {
  readFileSync, writeFileSync, existsSync, readdirSync, lstatSync, readlinkSync, mkdirSync,
  rmSync, copyFileSync, symlinkSync, cpSync, mkdtempSync, globSync, chmodSync,
} = fs;

// fs.globSync arrived in Node 22.0 and took withFileTypes in 22.2; check, sync and update are
// built on it. `rule` and `hooks` need neither, and `hooks` runs as the postinstall — refusing
// there would fail `npm install` for an app that otherwise runs.
const NODE_MIN = [22, 2];
const NEEDS_GLOB = new Set(["check", "sync", "update"]);

// ---------------------------------------------------------------- where we are
// fileURLToPath, not URL.pathname: on Windows the latter yields "/D:/..." and every read fails.
function projectRoot() {
  const from = dirname(fileURLToPath(import.meta.url));
  const { root } = parse(from);
  for (const marker of ["package.json", ".agents"]) {
    let dir = from;
    while (dir !== root) {
      // "has a docs/ directory" would match .agents/ itself, so the marker is never docs/.
      if (existsSync(join(dir, marker)) && !(marker === ".agents" && dir.endsWith(".agents"))) return dir;
      dir = dirname(dir);
    }
  }
  throw new Error("cli: cannot find the project root (no package.json and no .agents/ above me)");
}

const ROOT = projectRoot();
const argv = process.argv.slice(2);
const cmd = argv[0];
// `--name=value` or `--name value` — both get typed at a prompt, and the second used to be dropped
// silently, so `check --only plan` ran every check. null when absent, "" when given no value.
const option = (name) => {
  const i = argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (i === -1) return null;
  if (argv[i].includes("=")) return argv[i].split("=").slice(1).join("=");
  const next = argv[i + 1];
  return next && !next.startsWith("-") ? next : "";
};

// ------------------------------------------------------------------- utilities
const posix = (p) => p.split(sep).join("/");
const under = (dir, abs) => posix(relative(dir, abs));
const lf = (s) => s.replace(/\r\n/g, "\n");
const eolOf = (s) => (s.includes("\r\n") ? "\r\n" : "\n");
const read = (p) => lf(readFileSync(p, "utf8"));
const hash = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
// Matched by whole path segment: a substring test also skipped `.github/`, `.gitkeep` and any file
// whose name merely contained ".next".
const NOISE = new Set(["node_modules", ".next", ".git"]);
const noise = (p) => posix(isAbsolute(p) ? relative(ROOT, p) : p).split("/").some((s) => NOISE.has(s));
// `**` does not descend into a dot-directory, and the whole framework lives in .agents/. A bare
// "**/*.md" therefore skips the rulebook, the playbooks and the templates and prints "clean"
// having read almost nothing.
const files = (pattern) =>
  [...new Set(globSync([pattern, `.agents/${pattern}`], { cwd: ROOT, exclude: noise }))].map(posix);

const RULEBOOK = ".agents/docs";
const CANONICAL = ".agents/skills";
const canonicalDir = join(ROOT, CANONICAL);
// The two supported agents are Claude Code and Codex. Codex reads .agents/skills/ natively;
// Claude Code reads only .claude/skills/, so that one path gets a mirror. 05-WORKFLOW.md §4.
const MIRROR = ".claude/skills";
// Written by `sync` beside every AGENTS.md, never by hand. A shim holds no rules of its own.
// The fallback is plain text, not an HTML comment: Claude Code strips block-level comments from a
// CLAUDE.md before loading it, so a fallback written as one never reached the agent it was for.
const SHIM = `@AGENTS.md

This file holds no rules of its own. If AGENTS.md did not load above, read ./AGENTS.md now, and
the AGENTS.md of any directory you are about to write in.
`;
// Skill keys: the frontmatter Claude Code documents. `name` and `description` are the two both
// agents read; Codex ignores the rest. Claude Code ignores a key it does not recognise, with no
// error — so a misspelled `disable_model_invocation` leaves a skill model-invocable and nothing
// says so. The allowlist is what turns that typo into a failure. 05-WORKFLOW.md §4,
// .agents/docs/DECISIONS.md #30.
const FRONTMATTER_KEYS = new Set([
  "name", "description", "when_to_use", "argument-hint", "arguments", "disable-model-invocation",
  "user-invocable", "allowed-tools", "disallowed-tools", "model", "effort", "context", "agent",
  "background", "hooks", "paths", "shell", "metadata", "license", "compatibility",
]);
// Codex stops reading project docs at project_doc_max_bytes — 32 KiB by default, counted across the
// root AGENTS.md and every nested one on the path to where it was launched. The rest is cut off
// with no error. This leaves a quarter of that for the nested ones.
const ROOT_GUIDE_MAX_BYTES = 24 * 1024;

function skills() {
  if (!existsSync(canonicalDir)) return [];
  return readdirSync(canonicalDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(canonicalDir, e.name, "SKILL.md")))
    .map((e) => {
      const text = read(join(canonicalDir, e.name, "SKILL.md"));
      const frontmatter = text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
      return {
        name: e.name,
        frontmatter,
        body: text.replace(/^---\n[\s\S]*?\n---/, ""),
        description: frontmatter.match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? "",
        keys: [...frontmatter.matchAll(/^([A-Za-z][\w-]*):/gm)].map((m) => m[1]),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ------------------------------------------------------------------ rulebook
// The rulebook parsed into addressable sections. `NN §N` is the address format used in every
// citation; this is what makes it resolvable, for the guard and for the `rule` command alike.
// Without it a citation to one section costs a read of the whole file — 02-COMPONENTS.md is
// ~2,200 words to answer a ~400-word question, every time. 05-WORKFLOW.md §3a.
function rulebook() {
  const dir = join(ROOT, RULEBOOK);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    // 00-INDEX.md routes between the others and holds no numbered section, so it is not
    // addressable and does not belong in the map of addresses.
    .filter((f) => /^\d\d-.*\.md$/.test(f) && f !== "00-INDEX.md")
    .sort()
    .map((file) => {
      const body = read(join(dir, file));
      const heads = [...body.matchAll(/^##\s+(\d+[a-z]?)\.\s*(.*)$/gm)];
      const sections = heads.map((h, i) => ({
        n: h[1],
        title: h[2].trim(),
        body: body.slice(h.index, i + 1 < heads.length ? heads[i + 1].index : undefined).trim(),
      }));
      return { num: file.slice(0, 2), file, path: `${RULEBOOK}/${file}`, sections };
    });
}

// ================================================================ check: plan
// The index row, the phase file's Status, the [~] marker and NOW.md must all agree — in both
// directions, so a plan cannot quietly stop describing the work. 05-WORKFLOW.md §2.
function checkPlan(fail) {
  const INDEX = "plan/00-INDEX.md", NOW = "plan/NOW.md";
  const STATUSES = ["not started", "in progress", "done"];
  const CITE = "05-WORKFLOW.md §2";
  const unfilled = (v) => !v || v === "—" || v === "-";

  if (!existsSync(join(ROOT, INDEX))) return "no plan/00-INDEX.md yet — nothing to check";
  const index = read(join(ROOT, INDEX));

  const onDisk = globSync("plan/[0-9][0-9]-*.md", { cwd: ROOT })
    .map((p) => posix(p).replace("plan/", "")).filter((f) => f !== "00-INDEX.md").sort();

  const rows = [...index.matchAll(/^\|\s*(\d\d)\s*\|([^|]*)\|\s*([^|]+?)\s*\|\s*\[[^\]]*\]\(([^)]+)\)/gm)]
    .map(([, num, , status, file]) => ({ num, status: status.trim(), file: file.trim() }));
  const listed = new Set(rows.map((r) => r.file));
  const rowFor = new Map(rows.map((r) => [r.file, r]));

  for (const file of onDisk) {
    if (!listed.has(file)) fail(`plan/${file}  exists but is not listed in ${INDEX} — add its row`);
  }
  for (const row of rows) {
    if (!existsSync(join(ROOT, "plan", row.file)))
      fail(`${INDEX}  row ${row.num} points at plan/${row.file}, which does not exist`);
    if (!STATUSES.includes(row.status))
      fail(`${INDEX}  row ${row.num} status "${row.status}" — must be one of: ${STATUSES.join(", ")}`);
    if (!row.file.startsWith(row.num))
      fail(`${INDEX}  row ${row.num} points at plan/${row.file} — the numbers disagree`);
  }

  const inFlight = [], phases = [];
  for (const file of onDisk) {
    const body = read(join(ROOT, "plan", file));
    const steps = { open: 0, running: 0, done: 0 };

    body.split("\n").forEach((line, i) => {
      const m = line.match(/^\s*-\s\[([ x~])\]\s*(?:~~)?\s*(\d\d\.\d+)?/);
      if (!m) return;
      const [, mark, id] = m;
      if (mark === " ") steps.open++;
      if (mark === "~") { steps.running++; inFlight.push({ id: id ?? "?", file }); }
      if (mark === "x") {
        steps.done++;
        if (!line.includes("~~"))
          fail(`plan/${file}:${i + 1}  step ${id ?? ""} is done but not struck through — write ` +
               `\`- [x] ~~${id ?? "NN.N"} — ...~~\` (${CITE})`);
      }
    });

    const status = body.match(/^\*\*Status:\*\*\s*(.+?)\s*$/m)?.[1];
    const row = rowFor.get(file);
    if (!status) fail(`plan/${file}  has no "**Status:**" line (${CITE})`);
    else if (!STATUSES.includes(status))
      fail(`plan/${file}  status "${status}" — must be one of: ${STATUSES.join(", ")}`);
    else if (row && STATUSES.includes(row.status) && status !== row.status)
      fail(`plan/${file}  says "${status}", but ${INDEX} row ${row.num} says "${row.status}"`);

    phases.push({ file, steps, status, num: row?.num ?? file.slice(0, 2) });
  }

  for (const { file, steps, status } of phases) {
    const total = steps.open + steps.running + steps.done;
    if (!STATUSES.includes(status) || total === 0) continue;
    if (status === "in progress" && steps.running === 0)
      fail(`plan/${file}  is "in progress" but no step is marked [~]. Mark the step you are on ` +
           `and write ${NOW} before starting it, or set the phase back to "not started" (${CITE})`);
    if (status !== "in progress" && steps.running > 0)
      fail(`plan/${file}  marks a step [~] but the phase says "${status}" — a step in flight ` +
           `makes its phase "in progress", here and in ${INDEX} (${CITE})`);
    if (status === "not started" && steps.done > 0)
      fail(`plan/${file}  is "not started" but ${steps.done} step(s) are struck through`);
    if (status === "done" && steps.done < total)
      fail(`plan/${file}  is "done" but ${total - steps.done} step(s) are not. Finish them, or ` +
           `move them to a later phase — never leave them behind a "done"`);
    if (status !== "done" && steps.done === total)
      fail(`plan/${file}  has every step struck through but says "${status}" — set it and its ` +
           `${INDEX} row to "done", and move [~] to the next phase`);
  }

  if (inFlight.length > 1)
    fail(`${inFlight.map((s) => s.id).join(", ")} are all marked [~] — one step at a time (${CITE})`);

  if (!existsSync(join(ROOT, NOW))) {
    fail(`${NOW}  missing — the working file names the step in flight (${CITE})`);
  } else {
    const now = read(join(ROOT, NOW));
    const declared = now.match(/^\*\*Step:\*\*\s*(\d\d\.\d+|—)/m)?.[1];
    const actual = inFlight[0]?.id;

    if (!declared) fail(`${NOW}  has no "**Step:**" line — name the step in flight, or \`—\``);
    else if (declared === "—" && actual) fail(`${NOW}  says idle, but ${actual} is marked [~] in plan/${inFlight[0].file}`);
    else if (declared !== "—" && !actual) fail(`${NOW}  says ${declared}, but no step is marked [~]`);
    else if (declared !== "—" && declared !== actual) fail(`${NOW}  says ${declared}, but plan/${inFlight[0].file} marks ${actual} [~]`);

    // A NOW.md naming a step and saying nothing about it is the empty working file this check
    // exists to catch.
    if (declared && declared !== "—") {
      for (const [field, want] of [["Since", "the date you started it"],
                                   ["State", "what is done of it and what is left, in a line or two"]]) {
        const value = now.match(new RegExp(`^\\*\\*${field}:\\*\\*\\s*(.*?)\\s*$`, "m"))?.[1];
        if (unfilled(value)) fail(`${NOW}  **${field}:** is empty while ${declared} is in flight — write ${want} (${CITE})`);
      }
    }

    const indexNow = index.match(/^\*\*Now:\*\*\s*(\d\d|—)/m)?.[1];
    const nowPhase = declared && declared !== "—" ? declared.slice(0, 2) : null;
    const running = phases.filter((p) => p.status === "in progress");
    if (indexNow && nowPhase && indexNow !== nowPhase)
      fail(`${INDEX}  Now says ${indexNow}, but ${NOW} is working on ${declared}`);
    if (indexNow && !nowPhase && running.length === 1 && indexNow !== running[0].num)
      fail(`${INDEX}  Now says ${indexNow}, but plan/${running[0].file} is the phase in progress`);
    if (running.length > 1)
      fail(`${INDEX}  ${running.map((p) => p.num).join(", ")} are all "in progress" — one phase ` +
           `at a time, or the Now line cannot name it (${CITE})`);
  }

  return `${rows.length} phase(s), now: ${inFlight[0]?.id ?? "idle"}`;
}

// ================================================================ check: docs
// Every feature has its index, every §N, `rule NN N` and decision citation resolves, every
// framework path a playbook names exists, every AGENTS.md has its CLAUDE.md shim, and the root
// guide fits in what Codex reads. None of these can check an index is still TRUE — that is
// sync-index's job.
function checkDocs(fail) {
  if (!existsSync(join(ROOT, RULEBOOK))) return "no .agents/docs/ yet — nothing to check";

  const featureDirs = files("**/features/*/");
  for (const dir of featureDirs) {
    const d = dir.replace(/\/$/, "");
    if (!existsSync(join(ROOT, d, "AGENTS.md")))
      fail(`${d}/  has no AGENTS.md — every feature ships one (04-FEATURES.md §3)`);
  }

  // The rulebook index is framework-owned and restored by every update; a project that deleted
  // it lost the map.
  if (!existsSync(join(ROOT, RULEBOOK, "00-INDEX.md")))
    fail(`${RULEBOOK}/00-INDEX.md  missing — it is the rulebook's index, not a project file. ` +
         `Restore it with \`npm run update:framework\`.`);

  const docs = rulebook();
  const sections = new Map(docs.map((d) => [d.file, new Set(d.sections.map((s) => s.n))]));
  const byNumber = new Map(docs.map((d) => [d.num, d.file]));
  const filenames = new Set([...docs.map((d) => d.file), "00-INDEX.md"]);
  // "03-DATA.md §2", ".agents/docs/03-DATA.md §2", "03 §2"
  const CITATION = /(?:(?:\.agents\/)?docs\/)?(\d\d)(?:-[A-Z-]+\.md)?`?\s+§\s?(\d+[a-z]?)/g;
  // A link or mention carrying no § at all. The § check above cannot see one, and the 12-to-5
  // rulebook merge left exactly one dangling link behind in the seeded plan index, which then
  // shipped in every project made from the template until this check found it.
  const DOC_LINK = /(?:\.agents\/)?docs\/(\d\d-[A-Z-]+\.md)/g;
  // A section mark with no document number in front of it. The citation check above cannot see
  // one, and a playbook shipped pointing at a section that never existed because of it
  // (.agents/docs/DECISIONS.md #31). It resolves against the document the same line names before it
  // ("rule 02 7 — §7", "05-WORKFLOW.md ... §2") or straight after it ("§2 of 05-WORKFLOW.md");
  // inside a rulebook file, against that file. One that resolves against nothing fails.
  const BARE = /§\s?(\d+[a-z]?)/g;
  const NAMED_BEFORE = /(\d\d)-[A-Z-]+\.md|\brule (\d\d)\b|\b(\d\d) §/g;
  const NAMED_AFTER = /^§\s?\d+[a-z]?\s+of\s+`?(?:\.agents\/)?(?:docs\/)?(\d\d)-[A-Z-]+\.md/;
  // The command form — `rule 02 7` — carries no § at all, so none of the checks above could see
  // it, and it is how the routing table in 00-INDEX.md, the root guide and every layer index
  // cite. Only after `cli.mjs `, `npm run ` or a backtick, so prose about rule 12 of a lease is
  // left alone. A section mark after the document (`rule 02 §7`) is CITATION's to check.
  const RULE_CMD = /(?:cli\.mjs |npm run |`)rule(?: --)? (\d\d)(?: (\d+[a-z]?))?\b/g;
  // Its continuation — "`rule 03 2`, `03 3`, `03 4`" — checked only where citations live.
  const RULE_PAIR = /`(\d\d) (\d+[a-z]?)`/g;
  // Only where the framework's citations live. A project's own prose may use § for its own
  // sections — a contract, a spec, its own decisions — and a guard that fires on those gets
  // deleted.
  const citesRulebook = (file) => file.startsWith(".agents/") || file.startsWith("plan/") ||
    /(^|\/)AGENTS\.md$/.test(file) || !file.endsWith(".md");

  // A decision is cited by record and number. The framework's are .agents/docs/DECISIONS.md and a
  // project's docs/DECISIONS.md, each numbered from 1, so a citation of the file name alone names
  // neither — when they shared one sequence, the rulebook's #26 was a project's own #26
  // (.agents/docs/DECISIONS.md #34).
  // A record is history: what its entries cite is what was true when each was written.
  // The framework's first: `.agents/docs/DECISIONS.md` also ends in `docs/DECISIONS.md`.
  const RECORDS = [".agents/docs/DECISIONS.md", "docs/DECISIONS.md"];
  const DECISION = /([\w./-]*)DECISIONS\.md`?\s*(#\d+(?:(?:,\s*(?:and\s+)?|\s+and\s+)#\d+)*)/g;
  const entriesOf = new Map(RECORDS.map((rec) => [rec, existsSync(join(ROOT, rec))
    ? new Set([...read(join(ROOT, rec)).matchAll(/^##\s+(\d+)\./gm)].map((m) => m[1])) : null]));

  // A framework path in the prose an agent follows must exist. Three playbooks shipped telling
  // the agent to copy from templates that never existed — `.agents/templates/api/` beside the real
  // `api.md` — and every check above passed them, because none carried a §. Not a decision
  // record, for the reason above. A placeholder (`<name>`, `$1`) ends the match, so what is checked
  // is the real prefix before it.
  const FRAMEWORK_PATH = /(?<![\w-])\.agents\/[\w./-]*/g;
  const RULEBOOK_FILE = /^\.agents\/docs\/\d\d-[A-Z-]+\.md$/;          // DOC_LINK reports these
  const namesPaths = (file) => file.endsWith(".md") && !RECORDS.includes(file) &&
    (file.startsWith(".agents/") || /(^|\/)AGENTS\.md$/.test(file));
  // existsSync says yes to the wrong case on macOS and Windows, so a path right only there would
  // pass here and fail on Linux. Each segment is matched against the real listing instead.
  const existsExactly = (rel) => {
    let dir = ROOT;
    for (const part of rel.split("/").filter(Boolean)) {
      try { if (!readdirSync(dir).includes(part)) return false; } catch { return false; }
      dir = join(dir, part);
    }
    return true;
  };

  const cite = (at, docNum, sectionNum) => {
    const docFile = byNumber.get(docNum);
    if (!docFile) fail(`${at}  cites docs/${docNum}-*.md, which does not exist`);
    else if (sectionNum && !sections.get(docFile).has(sectionNum))
      fail(`${at}  cites ${docFile} §${sectionNum}, which has no such section — a ` +
           `section was renumbered without updating what points at it`);
  };

  const citeDecisions = (at, prefix, list, checkBare) => {
    const numbers = [...list.matchAll(/#(\d+)/g)].map((m) => m[1]);
    const record = RECORDS.find((rec) => `/${prefix}DECISIONS.md`.endsWith(`/${rec}`));
    if (!record) {
      if (!prefix && checkBare)
        fail(`${at}  DECISIONS.md ${list} names neither record — write ` +
             `.agents/docs/DECISIONS.md #N for the framework's decisions, docs/DECISIONS.md #N ` +
             `for this project's`);
      return;                                                     // someone else's DECISIONS.md
    }
    const have = entriesOf.get(record);
    if (!have) { fail(`${at}  cites ${record}, which does not exist`); return; }
    for (const n of numbers.filter((n) => !have.has(n))) {
      // The one a project hits after 3.0.0: its code still citing a framework entry where it was.
      const moved = record === "docs/DECISIONS.md" && entriesOf.get(RECORDS[0])?.has(n);
      fail(`${at}  cites ${record} #${n}, which has no such entry` + (moved
        ? ` — if it means the framework's, that is .agents/docs/DECISIONS.md #${n} now` : ""));
    }
  };

  // The guard's own test asserts that a dangling citation fails, so its fixtures contain dangling
  // citations. It is the only file in the repository allowed to, it is framework-owned, and it
  // never reaches a project — so this is one named exclusion rather than a `*.test.*` pattern
  // that would blind the check to every test anyone writes.
  const SELF_TEST = ".agents/cli.test.mjs";

  for (const file of files("**/*.{md,ts,tsx,mjs,scss}")) {
    if (file === SELF_TEST) continue;
    const ownDoc = file.match(/^\.agents\/docs\/(\d\d)-/)?.[1];
    const checkBare = citesRulebook(file);
    const checkPaths = namesPaths(file);
    read(join(ROOT, file)).split("\n").forEach((line, i) => {
      const at = `${file}:${i + 1}`;
      for (const [, docNum, sectionNum] of line.matchAll(CITATION)) cite(at, docNum, sectionNum);
      for (const [, docNum, sectionNum] of line.matchAll(RULE_CMD)) cite(at, docNum, sectionNum);
      if (!RECORDS.includes(file))
        for (const [, prefix, list] of line.matchAll(DECISION))
          citeDecisions(at, prefix, list, checkBare);
      for (const [, name] of line.matchAll(DOC_LINK)) {
        if (!filenames.has(name))
          fail(`${at}  links ${RULEBOOK}/${name}, which does not exist — a rulebook ` +
               `file was renamed or merged without updating what points at it`);
      }
      if (checkPaths) for (const [match] of line.matchAll(FRAMEWORK_PATH)) {
        const path = match.replace(/\.+$/, "");                      // a sentence's full stop
        if (!RULEBOOK_FILE.test(path) && !existsExactly(path))
          fail(`${at}  names ${path}, which does not exist — a framework file was renamed or ` +
               `merged without updating what points at it`);
      }
      if (!checkBare) return;
      if (file.endsWith(".md"))
        for (const [, docNum, sectionNum] of line.matchAll(RULE_PAIR)) cite(at, docNum, sectionNum);
      for (const m of line.matchAll(BARE)) {
        const before = line.slice(0, m.index);
        if (/\d\d(?:-[A-Z-]+\.md)?`?\s+$/.test(before)) continue;     // a full citation — checked above
        const doc = [...before.matchAll(NAMED_BEFORE)].at(-1)?.slice(1).find(Boolean) ??
          line.slice(m.index).match(NAMED_AFTER)?.[1] ??
          (byNumber.has(ownDoc) ? ownDoc : null);
        if (!doc) {
          fail(`${at}  §${m[1]} names no document — write it as \`NN §${m[1]}\` so it ` +
               `can be checked and fetched`);
        } else if (!byNumber.has(doc)) {
          fail(`${at}  §${m[1]} resolves to docs/${doc}-*.md, which does not exist`);
        } else if (!sections.get(byNumber.get(doc)).has(m[1])) {
          fail(`${at}  §${m[1]} resolves to ${byNumber.get(doc)}, which has no such section`);
        }
      }
    });
  }

  // Claude Code does not read AGENTS.md, so each one needs a shim beside it. Codex reads
  // AGENTS.md itself and needs nothing. `sync` writes the missing shims. 05-WORKFLOW.md §4.
  for (const file of files("**/AGENTS.md")) {
    const dir = dirname(file);
    const at = dir === "." ? "" : dir + "/";
    const shim = join(ROOT, dir, "CLAUDE.md");
    if (!existsSync(shim)) {
      fail(`${at}CLAUDE.md  missing — Claude Code does not read AGENTS.md, so each one needs ` +
           `its one-line shim (.agents/docs/DECISIONS.md #26). Run: npm run sync:agents`);
      continue;
    }
    const target = readFileSync(shim, "utf8").match(/@([\w./-]+\.md)/)?.[1];
    if (!target) fail(`${at}CLAUDE.md  has no @-import — a shim points at AGENTS.md and holds no rules of its own`);
    else if (!existsSync(join(ROOT, dir, target))) fail(`${at}CLAUDE.md  points at ${target}, which does not exist`);
  }

  const guide = join(ROOT, "AGENTS.md");
  const guideBytes = existsSync(guide) ? readFileSync(guide).length : 0;
  if (guideBytes > ROOT_GUIDE_MAX_BYTES)
    fail(`AGENTS.md  is ${Math.round(guideBytes / 1024)} KiB — over ${ROOT_GUIDE_MAX_BYTES / 1024} KiB, ` +
         `Codex starts cutting project docs off with no error. Move detail into the rulebook or a ` +
         `directory's own AGENTS.md (05-WORKFLOW.md §4)`);

  return `${docs.length} rulebook file(s), ${docs.reduce((n, d) => n + d.sections.length, 0)} sections, ` +
         `${featureDirs.length} feature(s)`;
}

// =============================================================== check: styles
// Two checks ESLint structurally cannot make: no hex outside tokens.scss (02 §7), and every class
// a *.classes.ts names exists in the stylesheet beside it (02 §2).
function checkStyles(fail) {
  const TOKENS = "core/styles/tokens.scss";
  // The framework's own copy-in starting point (02-COMPONENTS.md §7,
  // .agents/docs/DECISIONS.md #25) is real values by design and never reaches a project at this
  // path — it is copied to TOKENS, not
  // imported from here. One named exclusion, the same shape as checkDocs' SELF_TEST: it is
  // framework-owned, it never reaches a project, and a glob pattern broad enough to catch the
  // general case would also blind the check to a real project file named similarly.
  const TOKENS_TEMPLATE = ".agents/templates/tokens.scss";
  const sheets = files("**/*.scss");
  const maps = files("**/*.classes.ts");
  if (!sheets.length && !maps.length) return "no stylesheets or class maps yet — nothing to check";

  // Block comments are blanked in place rather than removed, so line numbers still point at the
  // real line. `url(#fade)` is an SVG filter reference, not a colour, and "fade" is four hex
  // digits — the naive match calls it a hardcoded colour and the fix is to stop trusting the
  // guard. Same for anything already inside var(), which is a token by definition. A line
  // comment is prose wherever it starts — `color: var(--x); // was #ff0000` failed — and url()
  // goes first, because `url(//cdn…)` is not one. And a selector is not a value: `#add-button`,
  // `#feed` and `#cafe` are ids spelled in hex digits, so the text before each `{`, back to the
  // last `;`, `{` or `}`, is blanked too — across lines, so a selector list split over several
  // goes, and a gradient's colours on lines of their own stay.
  const LINE_COMMENT = /(^|\s)\/\/.*$/;
  const scannable = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .split("\n")
    .map((line) => line.replace(/\burl\([^)]*\)/g, "").replace(LINE_COMMENT, "$1"))
    .join("\n")
    .replace(/[^{};]*\{/g, (m) => m.replace(/[^\n{]/g, " "))
    .split("\n");
  const withoutVars = (line) => line.replace(/\bvar\([^)]*\)/g, "");

  // Hex was the only spelling checked, so `color: white` and `rgb(0 0 0)` broke the same rule and
  // passed (.agents/docs/DECISIONS.md #31). A colour function wrapping a var() is a token being
  // adjusted, not a literal, and is left alone. A named colour only counts as the value of a
  // colour property — `tan` and `linen` mean nothing elsewhere.
  const COLOUR_FN = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g;
  const DECLARATION = /([a-zA-Z-]+)\s*:\s*([^;{}]+)/g;
  const COLOUR_PROP = new RegExp("^(?:color|background(?:-color)?|border(?:-(?:top|right|bottom|left|" +
    "block|inline)(?:-(?:start|end))?)?(?:-color)?|outline(?:-color)?|fill|stroke|(?:box|text)-shadow|" +
    "text-decoration(?:-color)?|caret-color|accent-color|column-rule(?:-color)?|stop-color|" +
    "flood-color|lighting-color|scrollbar-color)$", "i");
  const NAMED_COLOURS = new Set(`aliceblue antiquewhite aqua aquamarine azure beige bisque black
    blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue
    cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki
    darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue
    darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey
    dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green
    greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen
    lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey
    lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue
    lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid
    mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred
    midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered
    orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum
    powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen
    seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal
    thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen`.split(/\s+/));

  const literalColour = (line) => {
    const bare = withoutVars(line);
    const hex = bare.match(/#[0-9a-fA-F]{3,8}\b/)?.[0];
    if (hex) return hex;
    for (const [fn, args] of line.matchAll(COLOUR_FN)) if (!args.includes("var(")) return fn;
    for (const [, prop, value] of bare.matchAll(DECLARATION)) {
      if (!COLOUR_PROP.test(prop)) continue;
      const named = value.match(/[a-zA-Z][\w-]*/g)?.find((w) => NAMED_COLOURS.has(w.toLowerCase()));
      if (named) return named;
    }
    return null;
  };

  // Every class a stylesheet defines, with `&` resolved against its parent block at any depth.
  // Matching only `&__el` and `&--mod` one level under a top-level block failed
  // `&__row { &--active {} }`, `&-icon` and `.card .title` — the nesting 02 §7 calls fine and
  // preferred — on stylesheets that were correct.
  const definedClasses = (scss) => {
    const src = scss.replace(/\/\*[\s\S]*?\*\//g, "").split("\n")
      .map((line) => line.replace(LINE_COMMENT, "$1")).join("\n");
    const defined = new Set();
    const open = [[""]];                          // the resolved selector list of each open block
    let selector = "", quote = null, escaped = false;
    for (const ch of src) {
      // Inside a string a brace or a semicolon is text: `content: "{"` opened a block.
      if (quote) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === quote) quote = null;
        selector += ch;
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        selector += ch;
      } else if (ch === "{") {
        let parents = open.at(-1), own = selector.trim();
        selector = "";
        // @at-root takes what follows it out to the top level — a selector, not an at-rule.
        if (own.startsWith("@at-root")) {
          own = own.slice("@at-root".length).trim();
          if (!own.includes("&")) parents = [""];
        }
        // An at-rule (@media, @supports, @include) nests without changing what & means.
        if (!own || own.startsWith("@")) { open.push(parents); continue; }
        const resolved = own.split(",").map((s) => s.trim()).flatMap((s) =>
          parents.map((p) => (s.includes("&") ? s.replaceAll("&", p) : `${p} ${s}`.trim())));
        for (const s of resolved)
          for (const [, name] of s.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) defined.add(name);
        open.push(resolved);
      } else if (ch === "}") {
        if (open.length > 1) open.pop();
        selector = "";
      } else if (ch === ";") {
        selector = "";
      } else {
        selector += ch;
      }
    }
    return defined;
  };

  for (const file of sheets) {
    if (file === TOKENS || file.endsWith("/" + TOKENS) || file === TOKENS_TEMPLATE) continue;
    const src = read(join(ROOT, file)), original = src.split("\n");
    scannable(src).forEach((line, i) => {
      const colour = literalColour(line);
      if (colour) fail(`${file}:${i + 1}  hardcoded colour ${colour} — use a var(--…) from ${TOKENS} ` +
                       `(02-COMPONENTS.md §7)\n    ${original[i].trim().slice(0, 110)}`);
    });
  }

  for (const file of maps) {
    const src = read(join(ROOT, file));
    const moduleName = src.match(/from "\.\/(.+?\.module\.scss)"/)?.[1];
    if (!moduleName) { fail(`${file}  does not import a stylesheet — a class map with no module (02-COMPONENTS.md §2)`); continue; }

    let scss;
    try { scss = read(join(ROOT, dirname(file), moduleName)); }
    catch { fail(`${file}  imports ${moduleName}, which does not exist`); continue; }

    const defined = definedClasses(scss);

    // Comments stripped first: a doc comment explaining a class name is prose, not a lookup.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const referenced = [...code.matchAll(/styles\["([^"]+)"\]|styles\.([a-zA-Z0-9_$]+)/g)].map((m) => m[1] ?? m[2]);
    for (const name of new Set(referenced)) {
      if (!defined.has(name))
        fail(`${file}  "${name}" is not a class in ${moduleName} — fix the name, or use NO_CLASS ` +
             `if the modifier deliberately has no rule (02-COMPONENTS.md §2)`);
    }
  }

  return `${sheets.length} stylesheet(s), ${maps.length} class map(s)`;
}

// =============================================================== check: agents
// Claude Code and Codex see the same playbooks, or the one that differs is followed confidently
// and silently. 05-WORKFLOW.md §4. `fix` repairs what it can; frontmatter it cannot.
function checkAgents(fail, fix) {
  const hasSkills = existsSync(canonicalDir);
  const list = skills();
  const done = [];

  const canonicalFiles = !hasSkills ? [] : globSync("**/*", { cwd: canonicalDir, withFileTypes: true })
    .filter((e) => e.isFile()).map((e) => under(canonicalDir, join(e.parentPath ?? e.path, e.name))).sort();

  // -- frontmatter: the one thing a sync cannot write for you
  for (const s of list) {
    const where = `${CANONICAL}/${s.name}/SKILL.md`;
    if (!s.frontmatter) { fail(`${where}  has no --- frontmatter block — no agent will list it`, true); continue; }
    if (!s.description)
      fail(`${where}  has no description: — it is all an agent sees before deciding whether to ` +
           `open the playbook`, true);
    for (const key of s.keys) {
      if (FRONTMATTER_KEYS.has(key)) continue;
      fail(`${where}  frontmatter key "${key}" is not one Claude Code recognises — it ignores the ` +
           `key with no error, so whatever it was meant to do silently does not happen. Check the ` +
           `spelling (hyphens, not underscores). Allowed: ${[...FRONTMATTER_KEYS].join(", ")}`, true);
    }
    // Claude Code counts `$N` from zero — `$1` is the *second* argument — and substitutes it
    // anywhere in the body, code included. Written as the first, it quietly received the second:
    // `/new-component InvoiceRow shared` built `components/shared/` (.agents/docs/DECISIONS.md #37).
    const positional = [...new Set(s.body.match(/(?<!\\)\$\d+/g) ?? [])];
    if (positional.length)
      fail(`${where}  uses ${positional.join(", ")} — Claude Code counts arguments from $0, so ` +
           `$1 is the second one. Name them in \`arguments:\` and write $name, or escape a ` +
           `literal dollar as \\$`, true);
  }

  // -- the mirror. Codex reads .agents/skills/ itself; Claude Code reads only .claude/skills/.
  const link = (path) => {
    try {
      mkdirSync(dirname(path), { recursive: true });
      symlinkSync(posix(relative(dirname(path), canonicalDir)), path, "dir");
      return true;
    } catch { return false; }                       // Windows without developer mode, and most CI
  };

  const checkMirror = () => {
    const path = join(ROOT, MIRROR);
    const stat = existsSync(path) ? lstatSync(path) : null;

    if (stat?.isSymbolicLink()) {
      const target = resolve(dirname(path), readlinkSync(path));
      if (target !== canonicalDir) fail(`${MIRROR}  is a symlink to ${target}, not to ${CANONICAL}`);
      return;                                             // a correct symlink cannot drift
    }

    // A committed symlink cloned where symlinks are unavailable arrives as a one-line text file
    // holding its own target. It looks present and contains no skills at all.
    if (stat?.isFile()) {
      if (!fix) {
        fail(`${MIRROR}  is a file, not a directory — a committed symlink checked out on a ` +
             `platform without symlink support, so Claude Code sees no playbooks`);
        return;
      }
      rmSync(path); done.push(`removed ${MIRROR}, a symlink checked out as a plain file`);
    }

    const present = existsSync(path) && lstatSync(path).isDirectory();
    const missing = [], differs = [], extra = [];
    for (const rel of canonicalFiles) {
      const to = join(path, rel);
      if (!existsSync(to)) missing.push(rel);
      else if (hash(to) !== hash(join(canonicalDir, rel))) differs.push(rel);
    }
    if (present) {
      for (const e of globSync("**/*", { cwd: path, withFileTypes: true }).filter((x) => x.isFile())) {
        const rel = under(path, join(e.parentPath ?? e.path, e.name));
        if (!canonicalFiles.includes(rel)) extra.push(rel);
      }
    }

    if (fix) {
      if (!present && link(path)) { done.push(`symlinked ${MIRROR} -> ${CANONICAL}`); return; }
      for (const rel of [...missing, ...differs]) {
        mkdirSync(dirname(join(path, rel)), { recursive: true });
        copyFileSync(join(canonicalDir, rel), join(path, rel));
        done.push(`copied ${MIRROR}/${rel}`);
      }
      for (const rel of extra) { rmSync(join(path, rel)); done.push(`removed orphan ${MIRROR}/${rel}`); }
      // Removing a deleted skill's only file leaves its directory behind, and an empty skill
      // folder still enumerates as a skill.
      for (const e of readdirSync(path, { withFileTypes: true }).filter((x) => x.isDirectory())) {
        if (!readdirSync(join(path, e.name)).length) {
          rmSync(join(path, e.name), { recursive: true });
          done.push(`removed empty ${MIRROR}/${e.name}/`);
        }
      }
    } else if (!present) {
      fail(`${MIRROR}  missing — Claude Code reads skills from there and can see none of the ` +
           `${list.length} playbooks. Run: npm run sync:agents`);
    } else {
      for (const rel of missing) fail(`${MIRROR}/${rel}  missing — a skill Claude Code cannot see`);
      for (const rel of differs)
        fail(`${MIRROR}/${rel}  differs from ${CANONICAL}/${rel} — a stale copy is worse than no ` +
             `copy. Edit the canonical file, then run: npm run sync:agents`);
      for (const rel of extra) fail(`${MIRROR}/${rel}  orphan — its skill was deleted`);
      for (const e of readdirSync(path, { withFileTypes: true }).filter((x) => x.isDirectory())) {
        if (!readdirSync(join(path, e.name)).length)
          fail(`${MIRROR}/${e.name}/  empty directory — still enumerates as a skill`);
      }
    }
  };
  if (hasSkills) checkMirror();

  // -- shims: the one-line CLAUDE.md beside every AGENTS.md, for the agent that reads only CLAUDE.md
  // Written here, never by hand. An existing shim is never overwritten — a project may have
  // added imports of its own to it, and this file's whole job is not to be a second rulebook.
  for (const file of files("**/AGENTS.md")) {
    const dir = dirname(file);
    const shim = join(ROOT, dir, "CLAUDE.md");
    if (existsSync(shim)) continue;
    const at = dir === "." ? "" : dir + "/";
    if (fix) { writeFileSync(shim, SHIM); done.push(`wrote ${at}CLAUDE.md`); }
    // not reported here — checkDocs owns the message, so it is not printed twice
  }

  if (fix) return done;
  return hasSkills ? `${list.length} skill(s) in sync` : `no ${CANONICAL}/ yet — nothing to check`;
}

// ================================================================== command: check
const CHECKS = { plan: checkPlan, docs: checkDocs, styles: checkStyles, agents: checkAgents };

function check() {
  const only = option("only");
  if (only === "") { console.error(`cli: --only needs a value, e.g. --only=plan. Known: ${Object.keys(CHECKS).join(", ")}`); process.exit(2); }
  const names = only ? only.split(",").filter(Boolean) : Object.keys(CHECKS);
  for (const n of names) if (!CHECKS[n]) { console.error(`cli: no such check "${n}". Known: ${Object.keys(CHECKS).join(", ")}`); process.exit(2); }

  // --hook: run by Claude Code (.claude/settings.json), not by a person. Exit 2 is the code that
  // reaches the agent — it blocks a Stop and shows a PostToolUse the problem; exit 1 shows nothing.
  // A pass prints nothing, and a turn already sent back once by this hook is let go: the pre-commit
  // hook and CI still hold the line, and a hook that loops gets deleted.
  // .agents/docs/DECISIONS.md #38.
  const hook = option("hook") !== null;
  if (hook) {
    let input = {};
    try { if (!process.stdin.isTTY) input = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { /* no input is a run */ }
    if (input.stop_hook_active) return;
  }

  const failures = [];
  const notes = [];
  for (const name of names) {
    const before = failures.length;
    const note = CHECKS[name]((msg) => failures.push(`  [${name}] ${msg}`), false);
    notes.push(`  ${name.padEnd(7)} ${failures.length === before ? note : `${failures.length - before} problem(s)`}`);
  }

  if (failures.length) {
    console.error(`GUARD FAILED — ${failures.length} problem(s):\n`);
    for (const f of failures) console.error(f);
    console.error(`\nThe rules are in .agents/docs/. Skills: edit ${CANONICAL}/, then npm run sync:agents.`);
    process.exit(hook ? 2 : 1);
  }
  if (hook) return;
  console.log("guard: clean");
  for (const n of notes) console.log(n);
}

// =================================================================== command: sync
function sync() {
  const blocking = [];
  const done = checkAgents((msg, unfixable) => { if (unfixable) blocking.push("  " + msg); }, true);

  if (blocking.length) {
    console.error(`sync cannot write these for you — ${blocking.length} problem(s) in ${CANONICAL}/:\n`);
    for (const b of blocking) console.error(b);
    process.exit(1);
  }
  if (!done.length) { console.log("sync: already in sync"); return; }
  console.log(`sync: ${done.length} change(s)`);
  for (const d of done) console.log(`  ${d}`);
}

// ================================================================= command: update
// The whole framework is one directory, so an update is a copy into it. 05-WORKFLOW.md §6.
function update() {
  const NO_BRANCH = argv.includes("--no-branch");
  const die = (m) => { console.error(`update: ${m}`); process.exit(1); };
  const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim();
  const readJson = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null);

  if (!existsSync(join(ROOT, ".git"))) die("this is not a git repository — git is the only undo, refusing");
  if (git("status", "--porcelain"))
    die("the working tree has changes. Commit or stash them first — an update must be the only\n" +
        "        thing in the diff, or you cannot tell what it did.");

  const local = readJson(join(ROOT, ".agents/version.json")) ?? { version: "unknown" };
  const source = argv.slice(1).find((a) => !a.startsWith("--")) ?? local.source;
  if (!source) die("no source. Pass the framework's path or git URL once — it is remembered after that.");

  let from = resolve(ROOT, source);
  if (/^(https?:|git@|ssh:)/.test(source)) {
    const clone = mkdtempSync(join(tmpdir(), "framework-"));
    // On every exit, including die(): process.exit() skips finally blocks.
    process.on("exit", () => rmSync(clone, { recursive: true, force: true }));
    from = clone;
    console.log(`cloning ${source} ...`);
    execFileSync("git", ["clone", "--depth", "1", source, from], { stdio: "inherit" });
  }
  if (!existsSync(join(from, ".agents/docs"))) die(`${from} has no .agents/docs/ — that is not the framework`);
  if (from === ROOT) die("the source is this repository — nothing to update");

  const incoming = readJson(join(from, ".agents/version.json")) ?? { version: "unknown" };
  const commit = (() => {
    try { return execFileSync("git", ["-C", from, "rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim(); }
    catch { return null; }
  })();

  const branch = `framework-update-${incoming.version}`;
  if (!NO_BRANCH) {
    if (git("branch", "--list", branch)) die(`branch ${branch} already exists — finish or delete it, or pass --no-branch`);
    git("switch", "-c", branch);
  }

  // docs/ and kit/ are the framework's alone, so they are mirrored — extras deleted.
  const mirror = (rel) => {
    const src = join(from, rel), dst = join(ROOT, rel);
    if (!existsSync(src)) return;
    const keep = new Set(globSync("**/*", { cwd: src }));
    if (existsSync(dst)) for (const f of globSync("**/*", { cwd: dst }))
      if (!keep.has(f) && existsSync(join(dst, f))) rmSync(join(dst, f), { recursive: true, force: true });
    cpSync(src, dst, { recursive: true, force: true });
  };
  const overlay = (rel) => { if (existsSync(join(from, rel))) cpSync(join(from, rel), join(ROOT, rel), { recursive: true, force: true }); };

  // Whatever the incoming .agents/ holds, by what it holds, not by a list here. The updater that
  // runs is the project's old copy, so a list only learns of a new file one update late — which is
  // why the framework's decisions live in docs/, the one directory every updater has mirrored
  // (.agents/docs/DECISIONS.md #34). The guard's own tests never reach a project, and
  // version.json is written below.
  for (const e of readdirSync(join(from, ".agents"), { withFileTypes: true })) {
    if (e.name.startsWith(".") || ["skills", "version.json", "cli.test.mjs"].includes(e.name)) continue;
    if (e.isDirectory()) mirror(`.agents/${e.name}`); else overlay(`.agents/${e.name}`);
  }

  // skills/ cannot be mirrored — your own playbooks live there too. version.json records which
  // ones the framework shipped, so only those are removed when it drops one.
  const incomingSkills = globSync("*/", { cwd: join(from, ".agents/skills") }).map((d) => posix(d).replace(/\/$/, ""));
  const dropped = (local.skills ?? []).filter((s) => !incomingSkills.includes(s));
  for (const s of dropped) rmSync(join(ROOT, ".agents/skills", s), { recursive: true, force: true });
  overlay(".agents/skills");

  writeFileSync(join(ROOT, ".agents/version.json"), JSON.stringify(
    { version: incoming.version, source, commit, updated: new Date().toISOString().slice(0, 10), skills: incomingSkills.sort() },
    null, 2) + "\n");

  const notes = (() => {
    const p = join(ROOT, ".agents/UPGRADING.md");
    if (!existsSync(p)) return "";
    const body = read(p);
    const at = body.indexOf(`\n## ${local.version} `);            // entries are newest first
    return (at === -1 ? body : body.slice(0, at)).split(/\n## /).slice(1).map((s) => "## " + s.trim()).join("\n\n");
  })();

  const changed = git("status", "--porcelain", ".agents").split("\n").filter(Boolean).length;
  console.log(`\nframework ${local.version} -> ${incoming.version}${commit ? ` (${commit})` : ""}`);
  console.log(`${changed} file(s) changed, all under .agents/${NO_BRANCH ? "" : `, on branch ${branch}`}`);
  if (dropped.length) console.log(`removed, dropped by the framework: ${dropped.join(", ")}`);
  console.log(notes ? `\nWhat your project may have to do:\n\n${notes}\n` : "\nNo upgrade notes — the guards are the migration.\n");
  console.log("Next:\n  npm run verify     a new rule arrives as a failure naming the file and the section");
  console.log("  git diff           review it — nothing outside .agents/ was opened");
  // The tree was clean before this ran, so every untracked file under .agents/ is one it added —
  // `git checkout .` alone leaves those behind, along with the branch.
  console.log(`  git checkout -- . && git clean -fd -- .agents${NO_BRANCH ? "" : ` && git switch - && git branch -D ${branch}`}`);
  console.log("                     abort — every file back, everything it added gone");
}

// =================================================================== command: rule
// Prints one section of the rulebook, so a citation costs what it claims to cost.
//
// `NN §N` was always the address format; until this existed there was no way to fetch one, so
// every citation was answered by reading the whole file — 02-COMPONENTS.md is ~2,200 words to
// answer a ~400-word question, and an agent following three citations paid for the rulebook
// twice. The addresses were precise and the retrieval was not.
//
//   rule            every section, one line each — the map, cheaper than the index that describes it
//   rule 02         that file's sections
//   rule 02 7       §7, and nothing else
//   rule -q tokens  sections whose heading or body mentions "tokens"
//   rule 02 -q grid the same, in 02 alone
function ruleCmd() {
  const docs = rulebook();
  if (!docs.length) { console.error(`rule: no ${RULEBOOK}/ here`); process.exit(2); }

  // -q term, --q=term, --query term. Written by hand at a prompt, so both dashes work.
  const qi = argv.findIndex((a) => /^--?q(uery)?(=|$)/.test(a));
  const inline = qi !== -1 && argv[qi].includes("=");
  const query = qi === -1 ? null : (inline ? argv[qi].split("=").slice(1).join("=") : argv[qi + 1]);
  // A bare -q used to fall through to the map, which reads as "searched, found everything".
  if (qi !== -1 && !query) { console.error("rule: -q needs a term, e.g. rule -q tokens"); process.exit(2); }
  // Absolute argv indices throughout: qi is one, so the query's own value (qi + 1) is dropped
  // by index rather than by value — otherwise `rule 02 -q 02` eats the document number too.
  const args = argv.filter((a, i) => i > 0 && i !== qi && (inline || i !== qi + 1) && !a.startsWith("-"));
  // "02", "02-COMPONENTS.md", "§7", "7" — and "02 §7" arriving as one shell-quoted argument.
  const parts = args.flatMap((a) => a.split(/[\s§]+/)).filter(Boolean);
  const docArg = parts.find((p) => /^\d\d(-|$)/.test(p))?.slice(0, 2);
  const secArg = parts.find((p) => /^\d+[a-z]?$/.test(p) && p !== docArg);

  if (docArg && !docs.some((d) => d.num === docArg)) {
    console.error(`rule: no ${RULEBOOK}/${docArg}-*.md. Known: ${docs.map((d) => d.num).join(", ")}`);
    process.exit(2);
  }

  if (query) {
    const needle = query.toLowerCase();
    const hits = docs.filter((d) => !docArg || d.num === docArg).flatMap((d) => d.sections
      .filter((s) => `${s.title}\n${s.body}`.toLowerCase().includes(needle))
      .map((s) => `  ${d.num} §${s.n.padEnd(3)} ${s.title}`));
    const scope = docArg ? ` of ${docArg}` : "";
    console.log(hits.length ? `${hits.length} section(s)${scope} mentioning "${query}":\n\n${hits.join("\n")}\n
  node .agents/cli.mjs rule <NN> <N>   to read one` : `no section${scope} mentions "${query}"`);
    return;
  }

  if (!docArg) {
    console.log(`The rulebook — ${RULEBOOK}/. Read a section, not a file:\n`);
    for (const d of docs) {
      console.log(`${d.file}`);
      for (const s of d.sections) console.log(`  ${d.num} §${s.n.padEnd(3)} ${s.title}`);
    }
    console.log(`\n  node .agents/cli.mjs rule 02 7        one section`);
    console.log(`  node .agents/cli.mjs rule -q tokens   search`);
    return;
  }

  const doc = docs.find((d) => d.num === docArg);

  if (!secArg) {
    console.log(`${doc.path}\n`);
    for (const s of doc.sections) console.log(`  ${doc.num} §${s.n.padEnd(3)} ${s.title}`);
    return;
  }

  const section = doc.sections.find((s) => s.n === secArg);
  if (!section) {
    console.error(`rule: ${doc.file} has no §${secArg}. It has: ${doc.sections.map((s) => s.n).join(", ")}`);
    process.exit(2);
  }
  console.log(`${doc.path} §${section.n}\n\n${section.body}`);
}

// =================================================================== command: hooks
// Points git at the framework's own versioned hooks directory instead of the untracked, per-clone
// .git/hooks/ — so `npm install` (via `postinstall`) wires the pre-commit plan check on every
// machine with no husky, no symlink anyone has to remember to make. 05-WORKFLOW.md §3.
//
// Deliberately silent about what it cannot do: hooks are local and `--no-verify` skips them by
// design, so this is the earlier, cheaper copy of the check CI already runs on push, not a
// replacement for it (.agents/docs/DECISIONS.md #24).
function hooksCmd() {
  const dir = join(ROOT, ".agents/kit/hooks");
  if (!existsSync(dir)) { console.log("hooks: no .agents/kit/hooks/ here — nothing to install"); return; }
  if (!existsSync(join(ROOT, ".git"))) { console.log("hooks: not a git repository — skipping"); return; }

  try {
    execFileSync("git", ["config", "core.hooksPath", ".agents/kit/hooks"], { cwd: ROOT });
  } catch (err) {
    console.log(`hooks: could not set core.hooksPath (${err.message}). Run this yourself:\n` +
                `  git config core.hooksPath .agents/kit/hooks`);
    return;
  }

  // core.hooksPath needs the executable bit on POSIX; git for Windows runs a hook by its shebang
  // regardless of the mode bit, so the chmod is a no-op there rather than a second branch to write.
  for (const f of readdirSync(dir)) {
    try { chmodSync(join(dir, f), 0o755); } catch { /* best effort — see the message above if git still refuses it */ }
  }
  console.log("hooks: git core.hooksPath -> .agents/kit/hooks (pre-commit runs the plan guard)");
}

// ========================================================================= main
const [major, minor] = process.versions.node.split(".").map(Number);
if (NEEDS_GLOB.has(cmd) && (major < NODE_MIN[0] || (major === NODE_MIN[0] && minor < NODE_MIN[1]))) {
  console.error(`cli: \`${cmd}\` needs Node ${NODE_MIN.join(".")} or newer — this is ${process.version}. ` +
                `Upgrade Node; nothing here has changed.`);
  process.exit(1);
}

switch (cmd) {
  case "rule": ruleCmd(); break;
  case "check": check(); break;
  case "sync": sync(); break;
  case "update": update(); break;
  case "hooks": hooksCmd(); break;
  default:
    console.log(`.agents/cli.mjs — the rulebook reader, the checks, the sync and the updater

  rule [NN] [N] [-q term]                 npm run rule       — read one section, not a file
  check [--only plan,docs,styles,agents]  npm run guard
        [--hook]                          as a Claude Code hook: exit 2 on failure, silent on a pass
  sync                                   npm run sync:agents — the Claude Code mirror and shims
  update [path-or-url] [--no-branch]      npm run update:framework
  hooks                                   npm run hooks       — wires the pre-commit plan check`);
    process.exit(cmd ? 2 : 0);
}
