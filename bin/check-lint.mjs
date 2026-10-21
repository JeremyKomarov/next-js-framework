#!/usr/bin/env node
// Proves the kit's import firewall in both directions, inside a real project. The layering rules
// in 01 §1, §6 and §8 and 02 §2 and §6a are lint-enforced — and nothing ever ran them against an
// import they should stop, so `@/features/billing` (a feature's root) and anything in a
// `*.classes.ts` crossed the firewall for two releases (.agents/docs/DECISIONS.md #35).
//
//   node bin/check-lint.mjs <installed-scaffold>
//
// The scaffold must be installed. Probe files are written into src/ and everything is put back
// after. Each probe is one import, and only `no-restricted-imports` is read, so the probes may
// break every other rule without blurring the answer. Framework-only, like everything in bin/.
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";

const project = process.argv[2] && resolve(process.argv[2]);
const die = (s) => { console.error(`check-lint: ${s}`); process.exit(1); };
if (!project) die("no project. Usage: node bin/check-lint.mjs <installed-scaffold>");
if (!existsSync(join(project, "node_modules/eslint"))) die(`${project} is not installed — run npm install there first`);

// [file, import, should it be refused?]. Two features, so each has another to reach for.
const PROBES = [
  // 01 §1 — a feature never imports another feature, by any spelling
  ["src/features/alpha/a.ts", "@/features/beta", true],
  ["src/features/alpha/b.ts", "@/features/beta/api/beta.api", true],
  ["src/features/alpha/components/Card/Card.classes.ts", "@/features/beta", true],
  ["src/features/alpha/c.ts", "@/features/alpha/api/alpha.api", false],
  ["src/features/alpha/d.ts", "@/shared/utils/cn", false],
  // 01 §1 — the layers below features never depend back on one
  ["src/shared/e.ts", "@/features/alpha", true],
  ["src/core/f.ts", "@/features/alpha/api/alpha.api", true],
  ["src/store/g.store.ts", "@/features/alpha", true],
  ["src/shared/components/Card/Card.classes.ts", "@/features/alpha", true],
  ["src/core/i18n/messages.ts", "@/features/alpha/strings/alpha.strings", false],
  ["src/core/i18n/messages.ts", "@/server/secret.server", true],
  // 01 §8 — nothing outside server/ imports server/, by its root or a module in it
  ["src/shared/h.ts", "@/server", true],
  ["src/shared/i.ts", "@/server/secret.server", true],
  ["src/features/alpha/j.ts", "@/server/secret.server", true],
  ["src/shared/components/Card/Card.classes.ts", "@/server/secret.server", true],
  ["src/app/page.tsx", "@/server/secret.server", false],
  ["src/proxy.ts", "@/server/secret.server", false],
  ["src/middleware.ts", "@/server/secret.server", false],
  // 01 §8 — only server/db/ constructs a database client
  ["src/app/api/k/route.ts", "@/server/db/client", true],
  ["src/server/db/users.repo.ts", "@/server/db/client", false],
  // 01 §6 — no ../ chains
  ["src/features/alpha/hooks/useAlpha.ts", "../api/alpha.api", true],
  // 02 §2 — a stylesheet is imported by its class map alone
  ["src/features/alpha/components/Card/index.tsx", "./Card.module.scss", true],
  ["src/features/alpha/components/Card/Card.classes.ts", "./Card.module.scss", false],
  // 02 §6a — lucide-react through the Icon wrapper alone
  ["src/features/alpha/l.tsx", "lucide-react", true],
  ["src/shared/components/Icon/Icon.const.ts", "lucide-react", false],
];

// Each path is written under its real name — the zones match exact files (messages.ts, proxy.ts)
// and suffixes (*.classes.ts), so a renamed probe tests a different zone — with one import per
// line, and a refusal is attributed by line. Whatever a probe overwrites is put back after, and
// whatever it brings into existence is removed.
const files = new Map();
const probes = PROBES.map(([file, from, refused]) => {
  const lines = files.get(file) ?? [];
  lines.push(`import "${from}";`);
  files.set(file, lines);
  return { file, line: lines.length, refused, label: `${file} importing ${from}` };
});
// The firewall's zones are generated from the feature folders on disk, so both must exist.
const touched = [...files.keys(), "src/features/beta/index.ts"];
files.set("src/features/beta/index.ts", ["export {};"]);

const newest = (rel) => {               // the outermost path writing `rel` would create, if any
  let top = null;
  for (let p = rel; p !== "." && !existsSync(join(project, p)); p = dirname(p)) top = p;
  return top;
};
const created = new Set(touched.map(newest).filter(Boolean));
const backups = new Map(touched.filter((f) => existsSync(join(project, f)))
  .map((f) => [f, readFileSync(join(project, f))]));

let results;
try {
  for (const [file, lines] of files) {
    mkdirSync(dirname(join(project, file)), { recursive: true });
    writeFileSync(join(project, file), lines.join("\n") + "\n");
  }
  try {
    results = JSON.parse(execFileSync(process.execPath,
      [join(project, "node_modules/eslint/bin/eslint.js"), "--format", "json", ...files.keys()],
      { cwd: project, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
  } catch (e) {
    if (!e.stdout) throw e;
    results = JSON.parse(e.stdout);                       // eslint exits 1 when anything fails
  }
} finally {
  for (const path of created) rmSync(join(project, path), { recursive: true, force: true });
  for (const [file, body] of backups) writeFileSync(join(project, file), body);
}

const refused = new Set(results.flatMap((r) => r.messages
  .filter((m) => m.ruleId === "no-restricted-imports")
  .map((m) => `${r.filePath.slice(project.length + 1).split("\\").join("/")}:${m.line}`)));

let wrong = 0;
for (const { file, line, label, refused: expected } of probes) {
  if (refused.has(`${file}:${line}`) === expected) continue;
  wrong++;
  console.error(`check-lint: ${label} — should be ${expected ? "refused" : "allowed"}, ` +
                `and was ${expected ? "allowed" : "refused"}`);
}
console.log(`check-lint: ${probes.length - wrong} of ${probes.length} imports answered as the rulebook says`);
process.exit(wrong ? 1 : 0);
