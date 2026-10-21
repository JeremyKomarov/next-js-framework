#!/usr/bin/env node
// The framework's one script: four checks, the rule reader, the skill sync, and the updater.
// Rules live in .agents/docs/05-WORKFLOW.md §3; this is what makes them fail.
//
//   node .agents/cli.mjs rule [NN] [N]                            npm run rule
//   node .agents/cli.mjs check [--only=plan,docs,styles,agents]   npm run guard
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
import {
  readFileSync, writeFileSync, existsSync, readdirSync, lstatSync, readlinkSync, mkdirSync,
  rmSync, copyFileSync, symlinkSync, cpSync, mkdtempSync, globSync, chmodSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join, resolve, dirname, relative, parse, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

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
const flag = (name) => argv.find((a) => a.startsWith(`--${name}`));

// ------------------------------------------------------------------- utilities
const posix = (p) => p.split(sep).join("/");
const under = (dir, abs) => posix(relative(dir, abs));
const lf = (s) => s.replace(/\r\n/g, "\n");
const eolOf = (s) => (s.includes("\r\n") ? "\r\n" : "\n");
const read = (p) => lf(readFileSync(p, "utf8"));
const hash = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const noise = (p) => p.includes("node_modules") || p.includes(".next") || p.includes(".git");
// `**` does not descend into a dot-directory, and the whole framework lives in .agents/. A bare
// "**/*.md" therefore skips the rulebook, the playbooks and the templates and prints "clean"
// having read almost nothing.
const files = (pattern) =>
  [...new Set(globSync([pattern, `.agents/${pattern}`], { cwd: ROOT, exclude: noise }))].map(posix);

const RULEBOOK = ".agents/docs";
const CANONICAL = ".agents/skills";
const canonicalDir = join(ROOT, CANONICAL);
// <marker directory> : <where that agent looks>. Codex, Gemini CLI and opencode read
// .agents/skills/ natively and are deliberately absent — mirroring to them would list every
// playbook twice. Only two agents still need a copy. 05-WORKFLOW.md §4.
const MIRRORS = { ".claude": ".claude/skills", ".cursor": ".cursor/skills" };
// Written by `sync` where the agent needs one, never by hand. A shim holds no rules of its own.
const SHIM = `@AGENTS.md

<!-- If the import above did not expand, read ./AGENTS.md in this directory now, and the
     AGENTS.md of any directory you are about to write in. This file holds no rules of its own. -->
`;
// 2.0 generated one .toml per skill for Gemini CLI. It now reads .agents/skills/ natively, so
// those files are stale duplicates of playbooks it already has — pruned rather than left to rot.
const LEGACY_GEMINI_DIR = ".gemini/commands";
const TABLE = ["<!-- playbooks:start -->", "<!-- playbooks:end -->"];
// Keys every agent understands. A key from a *rules* file (paths, globs, alwaysApply) is not
// ignored by the rest — Claude Code drops the whole skill, silently. 05-WORKFLOW.md §4.
const FRONTMATTER_KEYS = new Set([
  "name", "description", "argument-hint", "allowed-tools", "model", "disable-model-invocation",
  "license", "version",
]);

function skills() {
  if (!existsSync(canonicalDir)) return [];
  return readdirSync(canonicalDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(canonicalDir, e.name, "SKILL.md")))
    .map((e) => {
      const frontmatter = read(join(canonicalDir, e.name, "SKILL.md")).match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
      return {
        name: e.name,
        frontmatter,
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
// ~2,600 tokens to answer a 350-token question, every time. 05-WORKFLOW.md §3a.
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

// Names, not descriptions. Every agent this framework supports discovers skills itself and loads
// each one's `description:` at startup — so a table of those descriptions in AGENTS.md is a
// second copy of something already in context, and AGENTS.md is the one file that loads on every
// session of every agent. Ten names cost ~40 words; ten descriptions cost ~410. The names are the
// affordance ("there is a playbook for this"); the description is one `rule`-sized lookup away.
const playbookTable = (list) =>
  `${TABLE[0]}\n\n` + list.map((s) => `\`${s.name}\``).join(" · ") + `\n\n`;

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
// Every feature has its index, every §N citation resolves, every AGENTS.md has its CLAUDE.md
// shim. None of these can check an index is still TRUE — that is the sync-index playbook's job.
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

  // The guard's own test asserts that a dangling citation fails, so its fixtures contain dangling
  // citations. It is the only file in the repository allowed to, it is framework-owned, and it
  // never reaches a project — so this is one named exclusion rather than a `*.test.*` pattern
  // that would blind the check to every test anyone writes.
  const SELF_TEST = ".agents/cli.test.mjs";

  for (const file of files("**/*.{md,ts,tsx,mjs,scss}")) {
    if (file === SELF_TEST) continue;
    read(join(ROOT, file)).split("\n").forEach((line, i) => {
      for (const [, docNum, sectionNum] of line.matchAll(CITATION)) {
        const docFile = byNumber.get(docNum);
        if (!docFile) { fail(`${file}:${i + 1}  cites docs/${docNum}-*.md, which does not exist`); continue; }
        if (!sections.get(docFile).has(sectionNum))
          fail(`${file}:${i + 1}  cites ${docFile} §${sectionNum}, which has no such section — a ` +
               `section was renumbered without updating what points at it`);
      }
      for (const [, name] of line.matchAll(DOC_LINK)) {
        if (!filenames.has(name))
          fail(`${file}:${i + 1}  links ${RULEBOOK}/${name}, which does not exist — a rulebook ` +
               `file was renamed or merged without updating what points at it`);
      }
    });
  }

  // Claude Code does not read AGENTS.md, so each one needs a shim beside it — but only where
  // Claude Code is in use. An agent is "in use" if its marker directory exists (05-WORKFLOW.md
  // §4); failing a project that has no .claude/ is a guard complaining about an agent nobody
  // runs. `sync` writes the missing ones, so this only proves the ones present still resolve.
  const claudeInUse = existsSync(join(ROOT, ".claude"));
  for (const file of files("**/AGENTS.md")) {
    const dir = dirname(file);
    const at = dir === "." ? "" : dir + "/";
    const shim = join(ROOT, dir, "CLAUDE.md");
    if (!existsSync(shim)) {
      if (claudeInUse)
        fail(`${at}CLAUDE.md  missing — Claude Code does not read AGENTS.md, so each one needs ` +
             `its one-line shim (DECISIONS.md #14). Run: npm run sync:agents`);
      continue;
    }
    const target = readFileSync(shim, "utf8").match(/@([\w./-]+\.md)/)?.[1];
    if (!target) fail(`${at}CLAUDE.md  has no @-import — a shim points at AGENTS.md and holds no rules of its own`);
    else if (!existsSync(join(ROOT, dir, target))) fail(`${at}CLAUDE.md  points at ${target}, which does not exist`);
  }

  return `${docs.length} rulebook file(s), ${docs.reduce((n, d) => n + d.sections.length, 0)} sections, ` +
         `${featureDirs.length} feature(s)`;
}

// =============================================================== check: styles
// Two checks ESLint structurally cannot make: no hex outside tokens.scss (02 §7), and every class
// a *.classes.ts names exists in the stylesheet beside it (02 §2).
function checkStyles(fail) {
  const TOKENS = "core/styles/tokens.scss";
  // The framework's own copy-in starting point (02-COMPONENTS.md §7, DECISIONS.md #25) is real
  // values by design and never reaches a project at this path — it is copied to TOKENS, not
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
  // guard. Same for anything already inside var(), which is a token by definition.
  const scannable = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .split("\n")
    .map((line) => (line.trim().startsWith("//") ? "" : line.replace(/\burl\([^)]*\)|\bvar\([^)]*\)/g, "")));

  for (const file of sheets) {
    if (file === TOKENS || file.endsWith("/" + TOKENS) || file === TOKENS_TEMPLATE) continue;
    scannable(read(join(ROOT, file))).forEach((line, i) => {
      const hex = line.match(/#[0-9a-fA-F]{3,8}\b/);
      if (hex) fail(`${file}:${i + 1}  hardcoded colour ${hex[0]} — use a var(--…) from ${TOKENS} ` +
                    `(02-COMPONENTS.md §7)\n    ${line.trim().slice(0, 110)}`);
    });
  }

  for (const file of maps) {
    const src = read(join(ROOT, file));
    const moduleName = src.match(/from "\.\/(.+?\.module\.scss)"/)?.[1];
    if (!moduleName) { fail(`${file}  does not import a stylesheet — a class map with no module (02-COMPONENTS.md §2)`); continue; }

    let scss;
    try { scss = read(join(ROOT, dirname(file), moduleName)); }
    catch { fail(`${file}  imports ${moduleName}, which does not exist`); continue; }

    // Selectors the stylesheet defines, including BEM parts written as &__el / &--mod.
    const defined = new Set([...scss.matchAll(/^\s*\.([a-zA-Z0-9_-]+)/gm)].map((m) => m[1]));
    for (const block of [...scss.matchAll(/^\.([a-zA-Z0-9_-]+)/gm)].map((m) => m[1]))
      for (const part of scss.matchAll(/&(__[a-zA-Z0-9_-]+|--[a-zA-Z0-9_-]+)/g)) defined.add(block + part[1]);

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
// Every agent sees the same playbooks, or the ones that differ are followed confidently and
// silently. 05-WORKFLOW.md §4. `fix` repairs what it can; frontmatter it cannot.
function checkAgents(fail, fix) {
  if (!existsSync(canonicalDir)) return `no ${CANONICAL}/ yet — nothing to check`;
  const list = skills();
  const done = [];

  const canonicalFiles = globSync("**/*", { cwd: canonicalDir, withFileTypes: true })
    .filter((e) => e.isFile()).map((e) => under(canonicalDir, join(e.parentPath ?? e.path, e.name))).sort();

  // -- frontmatter: the one thing a sync cannot write for you
  for (const s of list) {
    const where = `${CANONICAL}/${s.name}/SKILL.md`;
    if (!s.frontmatter) { fail(`${where}  has no --- frontmatter block — no agent will list it`, true); continue; }
    if (!s.description)
      fail(`${where}  has no description: — it is all an agent sees before deciding whether to ` +
           `open the playbook, and the generated table is built from it`, true);
    for (const key of s.keys) {
      if (FRONTMATTER_KEYS.has(key)) continue;
      fail(`${where}  frontmatter key "${key}" is not understood by every agent — Claude Code ` +
           `drops the whole skill rather than ignoring the key, so the playbook disappears with ` +
           `no error. Allowed: ${[...FRONTMATTER_KEYS].join(", ")}`, true);
    }
  }

  // -- mirrors
  const link = (path) => {
    try {
      mkdirSync(dirname(path), { recursive: true });
      symlinkSync(posix(relative(dirname(path), canonicalDir)), path, "dir");
      return true;
    } catch { return false; }                       // Windows without developer mode, and most CI
  };

  for (const [marker, mirror] of Object.entries(MIRRORS)) {
    if (!existsSync(join(ROOT, marker))) continue;        // that agent is not in use here
    const path = join(ROOT, mirror);
    const stat = existsSync(path) ? lstatSync(path) : null;

    if (stat?.isSymbolicLink()) {
      const target = resolve(dirname(path), readlinkSync(path));
      if (target !== canonicalDir) fail(`${mirror}  is a symlink to ${target}, not to ${CANONICAL}`);
      continue;                                           // a correct symlink cannot drift
    }

    // A committed symlink cloned where symlinks are unavailable arrives as a one-line text file
    // holding its own target. It looks present and contains no skills at all.
    if (stat?.isFile()) {
      if (!fix) {
        fail(`${mirror}  is a file, not a directory — a committed symlink checked out on a ` +
             `platform without symlink support, so that agent sees no playbooks`);
        continue;
      }
      rmSync(path); done.push(`removed ${mirror}, a symlink checked out as a plain file`);
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
      if (!present && link(path)) { done.push(`symlinked ${mirror} -> ${CANONICAL}`); continue; }
      for (const rel of [...missing, ...differs]) {
        mkdirSync(dirname(join(path, rel)), { recursive: true });
        copyFileSync(join(canonicalDir, rel), join(path, rel));
        done.push(`copied ${mirror}/${rel}`);
      }
      for (const rel of extra) { rmSync(join(path, rel)); done.push(`removed orphan ${mirror}/${rel}`); }
      // Removing a deleted skill's only file leaves its directory behind, and an empty skill
      // folder still enumerates as a skill.
      for (const e of readdirSync(path, { withFileTypes: true }).filter((x) => x.isDirectory())) {
        if (!readdirSync(join(path, e.name)).length) {
          rmSync(join(path, e.name), { recursive: true });
          done.push(`removed empty ${mirror}/${e.name}/`);
        }
      }
    } else if (!present) {
      fail(`${mirror}  missing entirely — ${marker}/ exists, so that agent is in use and can see ` +
           `none of the ${list.length} playbooks`);
    } else {
      for (const rel of missing) fail(`${mirror}/${rel}  missing — a skill this agent cannot see`);
      for (const rel of differs)
        fail(`${mirror}/${rel}  differs from ${CANONICAL}/${rel} — a stale copy is worse than no ` +
             `copy. Edit the canonical file, then run: npm run sync:agents`);
      for (const rel of extra) fail(`${mirror}/${rel}  orphan — its skill was deleted`);
      for (const e of readdirSync(path, { withFileTypes: true }).filter((x) => x.isDirectory())) {
        if (!readdirSync(join(path, e.name)).length)
          fail(`${mirror}/${e.name}/  empty directory — still enumerates as a skill`);
      }
    }
  }

  // -- legacy gemini adapters
  // 2.0 generated one .toml per skill because Gemini CLI had no skill support. It now reads
  // .agents/skills/ natively, so each .toml is a second, staler description of a playbook Gemini
  // already has — the exact drift the sync exists to prevent, pointed at itself.
  {
    const dir = join(ROOT, LEGACY_GEMINI_DIR);
    const stale = existsSync(dir)
      ? readdirSync(dir).filter((f) => f.endsWith(".toml") && list.some((s) => `${s.name}.toml` === f))
      : [];
    for (const file of stale) {
      if (fix) { rmSync(join(dir, file)); done.push(`removed ${LEGACY_GEMINI_DIR}/${file}, superseded by native skill support`); }
      else fail(`${LEGACY_GEMINI_DIR}/${file}  superseded — Gemini CLI reads ${CANONICAL}/ ` +
                `natively, so this is a stale second copy of that playbook's description. ` +
                `Run: npm run sync:agents`);
    }
    if (fix && stale.length && existsSync(dir) && !readdirSync(dir).length) {
      rmSync(dir, { recursive: true });
      done.push(`removed empty ${LEGACY_GEMINI_DIR}/`);
    }
  }

  // -- shims: the one-line pointers for the agents that do not read AGENTS.md themselves
  // Written here, never by hand. An existing shim is never overwritten — a project may have
  // added imports of its own to it, and this file's whole job is not to be a second rulebook.
  if (existsSync(join(ROOT, ".claude"))) {
    for (const file of files("**/AGENTS.md")) {
      const dir = dirname(file);
      const shim = join(ROOT, dir, "CLAUDE.md");
      if (existsSync(shim)) continue;
      const at = dir === "." ? "" : dir + "/";
      if (fix) { writeFileSync(shim, SHIM); done.push(`wrote ${at}CLAUDE.md`); }
      // not reported here — checkDocs owns the message, so it is not printed twice
    }
  }
  // Cursor reads the root AGENTS.md and stops there — it does not pick up a directory's own
  // AGENTS.md the way Codex and Claude Code do. Tier 2 is the whole lookup system, so without
  // this Cursor is the one agent that answers "does something here already do this?" by globbing.
  // An always-applied rule is the only hook Cursor offers for it, and it holds no rule of its
  // own — it is a pointer, like every other agent-specific file (DECISIONS.md #14).
  if (existsSync(join(ROOT, ".cursor"))) {
    const rule = join(ROOT, ".cursor/rules/agents-md.mdc");
    const want = `---
description: Always read the AGENTS.md of the directory you are about to write in.
alwaysApply: true
---

Before creating any component, hook, util, type or API call, read the \`AGENTS.md\` of the
directory you are about to write in, then \`src/shared/AGENTS.md\`. They inventory what already
exists; something that does 80% of it is a thing to extend, not to build beside.

After creating one, update that same \`AGENTS.md\` in the same change.

The rules themselves are addressed as \`<NN> §N\`. Read one section, not a whole file:
\`node .agents/cli.mjs rule 02 7\`. \`node .agents/cli.mjs rule\` lists every section.

This file holds no rules of its own. \`AGENTS.md\` is canonical.
`;
    if (!existsSync(rule) || read(rule) !== lf(want)) {
      if (fix) {
        mkdirSync(dirname(rule), { recursive: true });
        writeFileSync(rule, want);
        done.push(`wrote .cursor/rules/agents-md.mdc`);
      } else fail(`.cursor/rules/agents-md.mdc  ${existsSync(rule) ? "is out of date" : "missing"} — ` +
                  `without it Cursor never reads a directory's own AGENTS.md. Run: npm run sync:agents`);
    }
  }

  if (existsSync(join(ROOT, ".gemini"))) {
    // Gemini CLI reads GEMINI.md; settings.json is what puts AGENTS.md beside it. Both are
    // created when absent and never rewritten — settings.json is a project's own config file with
    // room for keys that are none of the framework's business, and clobbering it on every sync
    // would make it the one generated file that eats your edits without saying so.
    const settings = join(ROOT, ".gemini/settings.json");
    const want = JSON.stringify({ context: { fileName: ["AGENTS.md", "GEMINI.md"] } }, null, 2) + "\n";
    for (const [path, body, why] of [
      [join(ROOT, "GEMINI.md"), SHIM, "Gemini CLI reads it and finds no AGENTS.md without it"],
      [settings, want, "without it Gemini CLI reads GEMINI.md and not AGENTS.md"],
    ]) {
      if (existsSync(path)) continue;
      const at = under(ROOT, path);
      if (fix) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, body); done.push(`wrote ${at}`); }
      else fail(`${at}  missing — .gemini/ exists, so Gemini CLI is in use and ${why}. Run: npm run sync:agents`);
    }
  }

  // -- the playbook table in AGENTS.md, for agents with no command system
  const agentsMd = join(ROOT, "AGENTS.md");
  if (existsSync(agentsMd)) {
    const raw = readFileSync(agentsMd, "utf8");
    const body = lf(raw);
    const start = body.indexOf(TABLE[0]), end = body.indexOf(TABLE[1]);

    if (start === -1 || end === -1) {
      fail(`AGENTS.md  has no ${TABLE[0]} / ${TABLE[1]} markers around the playbook table — an ` +
           `agent with no command system finds skills through that table`);
    } else if (body.slice(start, end) !== playbookTable(list)) {
      if (fix) {
        const next = body.slice(0, start) + playbookTable(list) + body.slice(end);
        const eol = eolOf(raw);
        writeFileSync(agentsMd, eol === "\n" ? next : next.split("\n").join(eol));
        done.push("regenerated the playbook table in AGENTS.md");
      } else fail(`AGENTS.md  playbook table is out of date`);
    }
  }

  return fix ? done : `${list.length} skill(s) in sync`;
}

// ================================================================== command: check
const CHECKS = { plan: checkPlan, docs: checkDocs, styles: checkStyles, agents: checkAgents };

function check() {
  const only = flag("only")?.split("=")[1]?.split(",").filter(Boolean);
  const names = only?.length ? only : Object.keys(CHECKS);
  for (const n of names) if (!CHECKS[n]) { console.error(`cli: no such check "${n}". Known: ${Object.keys(CHECKS).join(", ")}`); process.exit(2); }

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
    process.exit(1);
  }
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
    from = mkdtempSync(join(tmpdir(), "framework-"));
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

  mirror(".agents/docs");
  overlay(".agents/cli.mjs");
  for (const d of [".agents/kit", ".agents/templates"]) if (existsSync(join(ROOT, d))) mirror(d);
  for (const f of [".agents/UPGRADING.md"]) overlay(f);

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
  console.log(`  git checkout . ${NO_BRANCH ? "" : "&& git switch -  "}   abort, and it is as if this never ran`);
}

// =================================================================== command: rule
// Prints one section of the rulebook, so a citation costs what it claims to cost.
//
// `NN §N` was always the address format; until this existed there was no way to fetch one, so
// every citation was answered by reading the whole file — 02-COMPONENTS.md is ~2,600 tokens to
// answer a 350-token question, and an agent following three citations paid for the rulebook
// twice. The addresses were precise and the retrieval was not.
//
//   rule            every section, one line each — the map, cheaper than the index that describes it
//   rule 02         that file's sections
//   rule 02 7       §7, and nothing else
//   rule -q tokens  sections whose heading or body mentions "tokens"
function ruleCmd() {
  const docs = rulebook();
  if (!docs.length) { console.error(`rule: no ${RULEBOOK}/ here`); process.exit(2); }

  // -q term, --q=term, --query term. Written by hand at a prompt, so both dashes work.
  const qi = argv.findIndex((a) => /^--?q(uery)?(=|$)/.test(a));
  const query = qi === -1 ? null : (argv[qi].split("=").slice(1).join("=") || argv[qi + 1]);
  // Absolute argv indices throughout: qi is one, so the query's own value (qi + 1) is dropped
  // by index rather than by value — otherwise `rule 02 -q 02` eats the document number too.
  const args = argv.filter((a, i) => i > 0 && i !== qi && i !== qi + 1 && !a.startsWith("-"));
  // "02", "02-COMPONENTS.md", "§7", "7" — and "02 §7" arriving as one shell-quoted argument.
  const parts = args.flatMap((a) => a.split(/[\s§]+/)).filter(Boolean);
  const docArg = parts.find((p) => /^\d\d(-|$)/.test(p))?.slice(0, 2);
  const secArg = parts.find((p) => /^\d+[a-z]?$/.test(p) && p !== docArg);

  if (query) {
    const needle = query.toLowerCase();
    const hits = docs.flatMap((d) => d.sections
      .filter((s) => `${s.title}\n${s.body}`.toLowerCase().includes(needle))
      .map((s) => `  ${d.num} §${s.n.padEnd(3)} ${s.title}`));
    console.log(hits.length ? `${hits.length} section(s) mentioning "${query}":\n\n${hits.join("\n")}\n
  node .agents/cli.mjs rule <NN> <N>   to read one` : `no section mentions "${query}"`);
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
  if (!doc) { console.error(`rule: no ${RULEBOOK}/${docArg}-*.md. Known: ${docs.map((d) => d.num).join(", ")}`); process.exit(2); }

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
// replacement for it (docs/DECISIONS.md #24).
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
switch (cmd) {
  case "rule": ruleCmd(); break;
  case "check": check(); break;
  case "sync": sync(); break;
  case "update": update(); break;
  case "hooks": hooksCmd(); break;
  default:
    console.log(`.agents/cli.mjs — the rulebook reader, the checks, the sync and the updater

  rule [NN] [N] [-q term]                 npm run rule       — read one section, not a file
  check [--only=plan,docs,styles,agents]  npm run guard
  sync                                    npm run sync:agents
  update [path-or-url] [--no-branch]      npm run update:framework
  hooks                                   npm run hooks       — wires the pre-commit plan check`);
    process.exit(cmd ? 2 : 0);
}
