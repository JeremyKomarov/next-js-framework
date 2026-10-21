#!/usr/bin/env node
// Scaffold a project from this framework. One command, three questions, a repository that
// `npm run dev` and `npm run verify` both work in.
//
//   node bin/create.mjs my-app           into a new directory
//   node bin/create.mjs .                in place, in this clone of the template
//   node bin/create.mjs . --yes          non-interactive, all defaults
//
// Run it from the template, not from npm — it is deliberately not published (DECISIONS.md #21).
//
// Flags: --yes  --name=<n>  --description=<d>  --db  --skip-install
//
// The framework itself is .agents/ and nothing else, so scaffolding is: run create-next-app,
// copy .agents/ and the root governance files in, merge one scripts block, wire Claude Code.
// This file is deleted from a scaffolded project — it belongs to the template, not to you.
import {
  readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync, cpSync, renameSync,
} from "node:fs";
import { execFileSync, execSync } from "node:child_process";
import { join, resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const TEMPLATE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const has = (f) => argv.includes(`--${f}`);
const opt = (f) => argv.find((a) => a.startsWith(`--${f}=`))?.split("=").slice(1).join("=");
const positional = argv.filter((a) => !a.startsWith("--"));

const c = { dim: "\x1b[2m", bold: "\x1b[1m", green: "\x1b[32m", red: "\x1b[31m", cyan: "\x1b[36m", off: "\x1b[0m" };
const say = (s = "") => console.log(s);
const step = (s) => say(`  ${c.green}✓${c.off} ${s}`);
const die = (s) => { console.error(`\n  ${c.red}✗${c.off} ${s}\n`); process.exit(1); };

// Everything the framework owns, plus the root files tool conventions pin in place. The root
// AGENTS.md is not here: the template's own is the guide for working on the framework, and a
// project's comes from .agents/templates/root-guide.md (DECISIONS.md #29).
const TEMPLATE_FILES = [".agents", "CLAUDE.md", ".claude/settings.json", "docs", "plan", ".gitattributes"];
const ROOT_GUIDE = ".agents/templates/root-guide.md";
// The project's CI, written to .github/workflows/. The template's own workflow tests the framework
// and runs this script, so a project must never inherit it (DECISIONS.md #28).
const CI_WORKFLOW = ".agents/kit/ci/verify.yml";
// Files that belong to the template repository alone. Never copied into a new directory; removed
// when scaffolding in place.
const TEMPLATE_ONLY = [".prettierignore"];

const SCRIPTS = {
  dev: "next dev",
  build: "next build",
  start: "next start",
  typecheck: "tsc --noEmit",
  lint: "eslint .",
  test: "vitest run",
  "test:watch": "vitest",
  rule: "node .agents/cli.mjs rule",
  guard: "node .agents/cli.mjs check",
  "sync:agents": "node .agents/cli.mjs sync",
  "update:framework": "node .agents/cli.mjs update",
  hooks: "node .agents/cli.mjs hooks",
  postinstall: "node .agents/cli.mjs hooks",
  verify: "npm run typecheck && npm run lint && npm run guard && npm run test",
};

// A tested combination, not the latest of each — .agents/docs/05-WORKFLOW.md §3 says why
// TypeScript stays on 6 and ESLint on 9.
//
// create-next-app is pinned to the same Next version, not @latest: it writes the files this
// script then rewrites, so an unpinned one changes what a scaffold contains with no commit here.
const NEXT = "16.3.4";
const DEPS = {
  "@hookform/resolvers": "^5.9.1", "@tanstack/react-query": "^5.102.8", "lucide-react": "^0.545.0",
  next: `^${NEXT}`, "next-intl": "^4.14.2", react: "^19.2.8", "react-dom": "^19.2.8",
  "react-hook-form": "^7.87.0", sass: "^1.104.0", "server-only": "0.0.1", zod: "^4.5.4",
  zustand: "^5.0.15",
};
const DEV_DEPS = {
  "@types/node": "^22.10.0", "@types/react": "^19.0.0", "@types/react-dom": "^19.0.0",
  eslint: "^9.39.5", "eslint-config-next": `^${NEXT}`, typescript: "^6.0.3", vitest: "^5.0.0",
};

// ------------------------------------------------------------------------ ask
async function ask(target) {
  const interactive = stdin.isTTY && !has("yes");
  const fallback = {
    name: opt("name") ?? basename(resolve(target)),
    description: opt("description") ?? "",
    db: has("db"),
  };
  if (!interactive) return fallback;

  const rl = createInterface({ input: stdin, output: stdout });
  const q = async (label, def) => {
    const answer = (await rl.question(`  ${label} ${c.dim}(${def})${c.off} `)).trim();
    return answer || def;
  };
  say();
  const name = await q("Project name", fallback.name);
  const description = await q("One sentence on what it is", fallback.description || "TODO — one sentence.");
  const db = (await q("Does it have a database? y/N", fallback.db ? "y" : "n")).toLowerCase().startsWith("y");
  rl.close();
  return { name, description, db };
}

// -------------------------------------------------------------------- helpers
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const writeJson = (p, v) => writeFileSync(p, JSON.stringify(v, null, 2) + "\n");
const sorted = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));

function run(cmd, args, cwd) {
  // On Windows npm and npx are .cmd shims, and since the CVE-2024-27980 fix Node refuses to
  // spawn one without a shell. So Windows gets a single quoted command string — an args array
  // plus shell:true is the combination that warns (DEP0190) and would mangle "@/*".
  try {
    if (process.platform === "win32") {
      const quote = (a) => (/^[\w.@/:\\-]+$/.test(a) ? a : `"${a.replace(/"/g, '\\"')}"`);
      execSync([cmd, ...args].map(quote).join(" "), { cwd, stdio: "inherit" });
    } else {
      execFileSync(cmd, args, { cwd, stdio: "inherit" });
    }
  }
  catch { die(`\`${cmd} ${args.join(" ")}\` failed. Nothing was rolled back — read the output above.`); }
}

// create-next-app refuses any directory holding files it does not recognise, and this one holds
// AGENTS.md, .agents/ and plan/. So it scaffolds into a subdirectory and the result is moved up.
function scaffoldNext(root) {
  const staging = join(root, "next-app-tmp");   // not ".next-app": npm rejects a name starting with "."
  rmSync(staging, { recursive: true, force: true });

  run("npx", ["--yes", `create-next-app@${NEXT}`, "next-app-tmp", "--ts", "--src-dir", "--app",
              "--no-tailwind", "--no-eslint", "--import-alias", "@/*", "--use-npm",
              "--skip-install", "--no-turbopack", "--no-git"], root);
  if (!existsSync(join(staging, "package.json"))) die("create-next-app produced no package.json");

  for (const entry of readdirSync(staging)) {
    const from = join(staging, entry), to = join(root, entry);
    // Our .gitignore is the comprehensive one; keep it and take any line Next adds that we lack.
    if (entry === ".gitignore" && existsSync(to)) {
      const ours = readFileSync(to, "utf8").split("\n");
      const extra = readFileSync(from, "utf8").split("\n")
        .filter((l) => l.trim() && !l.startsWith("#") && !ours.some((o) => o.trim() === l.trim()));
      if (extra.length) writeFileSync(to, readFileSync(to, "utf8").replace(/\n*$/, "\n") + `\n# From create-next-app\n${extra.join("\n")}\n`);
      continue;
    }

    // Next 16 writes its own AGENTS.md, and `next dev` re-adds the block on every run. Ours is
    // canonical and carries the lookup protocol, so the two are merged rather than one winning:
    // Next's block is appended, where its own markers let it rewrite in place forever after.
    if (entry === "AGENTS.md" && existsSync(to)) {
      const theirs = readFileSync(from, "utf8").trim();
      const ours = readFileSync(to, "utf8").replace(/\n*$/, "\n");
      if (theirs) writeFileSync(to, `${ours}\n---\n\n${theirs}\n`);
      continue;
    }

    rmSync(to, { recursive: true, force: true });
    renameSync(from, to);
  }
  rmSync(staging, { recursive: true, force: true });
}

// ------------------------------------------------------------------------ main
const targetArg = positional[0];
if (!targetArg) die(`no target directory.\n\n    node bin/create.mjs my-app\n    node bin/create.mjs .          ${c.dim}in place, in this clone${c.off}`);

const root = resolve(process.cwd(), targetArg);
const inPlace = root === TEMPLATE;

say(`\n  ${c.bold}create${c.off} ${c.dim}${readJson(join(TEMPLATE, ".agents/version.json")).version}${c.off}`);

if (!inPlace) {
  if (existsSync(root) && readdirSync(root).some((f) => ![".git", ".gitignore", "README.md", "LICENSE"].includes(f)))
    die(`${root} is not empty. Pick an empty directory, or cd into it and run with \`.\``);
  mkdirSync(root, { recursive: true });
}

const answers = await ask(root);

say();

// 1. the framework's files
if (!inPlace) {
  for (const f of TEMPLATE_FILES) {
    if (!existsSync(join(TEMPLATE, f))) continue;
    mkdirSync(dirname(join(root, f)), { recursive: true });
    cpSync(join(TEMPLATE, f), join(root, f), { recursive: true });
  }
  if (existsSync(join(TEMPLATE, ".gitignore")) && !existsSync(join(root, ".gitignore")))
    cpSync(join(TEMPLATE, ".gitignore"), join(root, ".gitignore"));
  step(`framework copied into ${basename(root)}/`);
}
// Before create-next-app runs, which merges its own block into whatever AGENTS.md is here. In
// place, this replaces the framework's working guide with the project's.
cpSync(join(TEMPLATE, ROOT_GUIDE), join(root, "AGENTS.md"));

// 2. the app
scaffoldNext(root);
step("next app scaffolded (typescript, src/, app router, no tailwind)");

// 3. the kit — configs the framework owns, overwriting what create-next-app wrote
for (const f of ["eslint.config.mjs", "tsconfig.json", "vitest.config.mts"])
  cpSync(join(root, ".agents/kit", f), join(root, f));
rmSync(join(root, "eslint.config.js"), { force: true });
rmSync(join(root, ".eslintrc.json"), { force: true });

const pkg = readJson(join(root, "package.json"));
pkg.name = answers.name.toLowerCase().replace(/[^a-z0-9-_]+/g, "-").replace(/^-+|-+$/g, "") || "app";
pkg.private = true;
pkg.scripts = { ...pkg.scripts, ...SCRIPTS };
pkg.dependencies = sorted({ ...pkg.dependencies, ...DEPS });
pkg.devDependencies = sorted({ ...pkg.devDependencies, ...DEV_DEPS });
writeJson(join(root, "package.json"), pkg);
step("kit installed — verify, guard, sync:agents, update:framework wired");

// Without this a project's only gate is the one people run by hand. In place, it replaces the
// template's own workflow, which would run this deleted script on the first push.
mkdirSync(join(root, ".github/workflows"), { recursive: true });
cpSync(join(root, CI_WORKFLOW), join(root, ".github/workflows/verify.yml"));
step("CI written — .github/workflows/verify.yml runs npm run verify on every push");

// 4. the app's entry files, framework-shaped
//
// create-next-app's defaults do not survive `npm run verify`: the layout uses `LayoutProps`, a
// global that only exists once `.next/types` has been generated by a build. Its splash page is
// also the exact defect the rulebook forbids — a screen that looks finished and is not. So both
// are replaced with the honest minimum, and its CSS with SCSS (02-COMPONENTS.md §7).
rmSync(join(root, "src/app/globals.css"), { force: true });
rmSync(join(root, "src/app/page.module.css"), { force: true });
for (const svg of ["file", "globe", "next", "vercel", "window"])
  rmSync(join(root, `public/${svg}.svg`), { force: true });

writeFileSync(join(root, "src/app/globals.scss"), `// Phase 01.2 replaces this with core/styles/tokens.scss — copy .agents/templates/tokens.scss in
// whole, then re-hue its brand ramp. It owns every token and is the only file allowed to contain
// a hex colour (.agents/docs/02-COMPONENTS.md §7).
*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  line-height: 1.5;
}
`);

writeFileSync(join(root, "src/app/layout.tsx"), `import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.scss";

export const metadata: Metadata = {
  title: ${JSON.stringify(answers.name)},
  description: ${JSON.stringify(answers.description)},
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`);

writeFileSync(join(root, "src/app/page.tsx"), `// The one honest thing to render before anything is built. Phase 01 replaces this route: the
// app shell, the feature registry, and a page built with featurePage() (.agents/docs/04-FEATURES.md §2).
export default function Home() {
  return (
    <main style={{ padding: "3rem", maxWidth: "40rem" }}>
      <h1>${answers.name.replace(/[<>&]/g, "")}</h1>
      <p>Nothing is built yet. That is not a bug — it is where the project starts.</p>
      <p>
        <code>plan/01-foundation.md</code> is the one phase the framework prescribes. Mark step
        01.1 in progress, write <code>plan/NOW.md</code>, and begin.
      </p>
    </main>
  );
}
`);
step("app entry replaced — no splash screen pretending the app exists");

// 5. the three layer indexes, so tier 2 exists from the first commit
const LAYERS = {
  "src/shared": `# \`shared/\` — the reuse layer

Check this file before building any component, hook, or util.
The rules: \`node .agents/cli.mjs rule 02 5\` (does one already exist?), \`rule 02 6\` (does it
go here?). Fetch the section — do not open the file.

## Components

| Component | What it is | When to use | Replaces |
|---|---|---|---|

<!-- Rows are added as components are built. The kit for this project — which primitives are built
     ahead of the first feature screen — is chosen by the plan-kit playbook (step 01.9) and recorded
     above this table. Shape: .agents/templates/index.md. -->

## Hooks

| Hook | What it does | When to use |
|---|---|---|

## Utils

| Util | What it does | When to use |
|---|---|---|

## Promotion rule

A component starts inside a feature. The moment a second feature needs something close,
generalize it here instead of copying it. Use the \`promote\` playbook.

## Keep this file current

Adding, changing, or removing anything under \`shared/\` updates this file in the same change.
`,
  "src/core": `# \`core/\` — app-wide configuration, never UI

**Configuration only.** If it holds runtime state it does not belong here — global stores live in
\`store/\`, a sibling of \`core/\`. \`core/\` is what the app boots with; \`store/\` is what changes
while it runs. The rule: \`node .agents/cli.mjs rule 01 3\`.

| Path | What | Rule |
|---|---|---|

<!-- Filled by phase 01: features.const.ts, env.ts, routes/query-keys/storage-keys, api-error,
     i18n/messages.ts, styles/tokens.scss. Shape: .agents/templates/index.md. -->

## Keep this table current
`,
  "src/store": `# \`store/\` — global client state

Only what more than one feature reads. Split from \`core/\` because \`core/\` is boot-time
configuration and this is what changes while the app runs.
The rule: \`node .agents/cli.mjs rule 01 7\`.

| Store | Holds | Read it through |
|---|---|---|

## What does not belong here

- **Server state.** That is TanStack Query's.
- **Feature-local state.** \`useState\` first; a feature's own \`store/\` if it must be shared.
- **The signed-in user.** Resolved on the server, passed down as a prop.

## Keep this file current
`,
};
// The CLAUDE.md shim beside each of these is written by `sync` at step 7, not here — one copy of
// that text, in the tool that also writes it for every feature index created later.
for (const [dir, body] of Object.entries(LAYERS)) {
  mkdirSync(join(root, dir), { recursive: true });
  writeFileSync(join(root, dir, "AGENTS.md"), body);
}
step("src/shared, src/core, src/store indexed (tier 2 lives from commit one)");

// 6. the root guide
const agentsMd = join(root, "AGENTS.md");
let guide = readFileSync(agentsMd, "utf8");
guide = guide
  .replace(/^# <PROJECT NAME> — working guide$/m, `# ${answers.name} — working guide`)
  .replace(/\*\*What this is:\*\* <one paragraph[^>]*>/s, `**What this is:** ${answers.description}`)
  .replace(/^1\. <the thing that blocks the most>$/m, "1. Phase 01 — tokens, env, the error taxonomy, the shared utils, the feature registry.")
  .replace(/^2\. <the next thing>$/m, "2. Choose this project's UI kit with the `plan-kit` playbook, then build it before the first feature screen (`02 §6`).")
  .replace(/^3\. <the next thing>$/m, "3. The first feature screen.")
  .replace(/^\| <area> \| <Real[^|]*\|$/m,
    ["| App shell | Does not exist. |",
     "| Design tokens | Does not exist — phase 01.2. |",
     "| Shared UI kit | Not chosen yet — `plan-kit`, step 01.9. |",
     `| Database | ${answers.db ? "Planned, confined to `server/db/` (`01 §8`)." : "None. `server/db/` is never created."} |`,
    ].join("\n"))
  .replace(/^- <production infrastructure, real credentials, anything with users on it>$/m,
    "- <production infrastructure, real credentials, anything with users on it — name yours here>");
writeFileSync(agentsMd, guide);
step("AGENTS.md filled in");

// 7. the agents
//
// Codex reads AGENTS.md and .agents/skills/ where they already are. Claude Code needs the
// .claude/skills mirror and a CLAUDE.md shim beside every AGENTS.md, and `sync` writes both —
// it runs again on every change, so the wiring has exactly one implementation and a scaffolded
// project cannot start out differently from a synced one.
run(process.execPath, [join(root, ".agents/cli.mjs"), "sync"], root);
step("Claude Code and Codex wired");

// 8. the project's own README replaces the framework's
writeFileSync(join(root, "README.md"), `# ${answers.name}

${answers.description}

\`\`\`sh
npm install
npm run dev
\`\`\`

\`npm run verify\` is the gate — typecheck, lint, the guards and tests. Run it before any PR.

Everything else — where files go, how to add an API call, what is already built — is in
[\`AGENTS.md\`](AGENTS.md) and the rulebook it points at. Conventions live there once; they do not
belong in a README twice.
`);

// A repository before the install, so `postinstall` has one to wire the pre-commit plan check
// into — create-next-app runs with --no-git, and without this the hook was a manual step everyone
// skipped. Not when the target already sits inside a repository: that one is the user's.
const insideRepo = (() => {
  try { execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: root, stdio: "ignore" }); return true; }
  catch { return false; }
})();
if (!insideRepo) {
  try {
    execFileSync("git", ["init", "--quiet"], { cwd: root, stdio: "ignore" });
    step("git repository initialised");
  } catch {
    say(`  ${c.dim}git is not available — skipped git init and the pre-commit hook${c.off}`);
  }
}
// The hook is wired only into a repository rooted here — in place, the template clone's own.
const ownRepo = existsSync(join(root, ".git"));

if (!has("skip-install")) {
  say(`\n  ${c.dim}installing dependencies…${c.off}\n`);
  run("npm", ["install"], root);                    // postinstall wires the hook
} else if (ownRepo) {
  run(process.execPath, [join(root, ".agents/cli.mjs"), "hooks"], root);
}

// 9. the template's own scaffolding is not the project's. `new-project` stays: it is now a
// four-line playbook pointing back here, and deleting it would only invite the next
// `update:framework` to copy it in again.
//
// cli.test.mjs goes for the same reason plus a sharper one: it tests the framework's CLI against
// deliberately broken fixtures, so a project that kept it would fail its own docs check on the
// dangling citations the test exists to assert on. `update:framework` never copies it either.
try { rmSync(join(root, "bin"), { recursive: true, force: true }); } catch { /* held open on Windows */ }
rmSync(join(root, ".agents/cli.test.mjs"), { force: true });
for (const f of TEMPLATE_ONLY) rmSync(join(root, f), { force: true });

const next = [];
if (!ownRepo)
  next.push(`${c.bold}npm run hooks${c.off} once this is its own git repository — it wires the pre-commit plan check.`);
next.push(`${c.bold}plan/01-foundation.md${c.off} is the one phase the framework prescribes. Mark 01.1 [~],\n` +
          `       set the phase to "in progress" in the file and plan/00-INDEX.md, and write plan/NOW.md.`);
next.push(`Read ${c.bold}AGENTS.md${c.off}. Then ${c.bold}node .agents/cli.mjs rule${c.off} — the rulebook,\n` +
          `       one line per section. Fetch a section; never open the file.`);
next.push(`${c.bold}npm run verify${c.off} before every PR. CI runs it on every push once you add a remote.`);

say(`\n  ${c.green}Done.${c.off} ${c.dim}${inPlace ? "" : `cd ${basename(root)} && `}npm run dev${c.off}\n`);
say(`  ${c.cyan}Next${c.off}`);
next.forEach((line, i) => say(`    ${i + 1}. ${line}`));
say();
