#!/usr/bin/env node
// Runs the code templates through a real project's toolchain. .agents/templates/api.md and
// component.md are code an agent copies verbatim, and nothing ever executed them — so api.md
// shipped `../` imports its own lint rule rejects and a `useMutation` option TanStack does not
// have, and every API call built from it started as four errors (.agents/docs/DECISIONS.md #32).
//
//   node bin/check-templates.mjs <installed-scaffold>
//
// The scaffold must be installed — `node bin/create.mjs <dir> --yes`, without --skip-install — and
// throwaway: the templates are written into it. Each block lands where its heading names, phase
// 01's modules are stubbed at the paths the templates import, and the scaffold's own tsc, eslint
// and styles guard judge the result. Framework-only, like everything in bin/.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TEMPLATES = resolve(dirname(fileURLToPath(import.meta.url)), "../.agents/templates");
const project = process.argv[2] && resolve(process.argv[2]);
const die = (s) => { console.error(`check-templates: ${s}`); process.exit(1); };
if (!project) die("no project. Usage: node bin/check-templates.mjs <installed-scaffold>");
if (!existsSync(join(project, "node_modules/typescript"))) die(`${project} is not installed — run npm install there first`);

const put = (rel, body) => {
  mkdirSync(dirname(join(project, rel)), { recursive: true });
  writeFileSync(join(project, rel), body);
};

// Every code block under each `### heading` of a template, with that heading.
const blocks = (file) =>
  readFileSync(join(TEMPLATES, file), "utf8").split(/^### /m).slice(1)
    .flatMap((section) => [...section.matchAll(/```\w+\n([\s\S]*?)```/g)]
      .map(([, code]) => ({ heading: section.split("\n")[0], code })));

const written = { "api.md": 0, "component.md": 0 };

// api.md: a block's path is its leading `// <path>` comment, else the first `path` in its heading.
// <owner> becomes a feature named "example", the name the template's imports already use.
for (const { heading, code } of blocks("api.md")) {
  const path = code.match(/^\/\/ (\S+\.tsx?)\n/)?.[1] ?? heading.match(/`([^`]+\.tsx?)`/)?.[1];
  if (!path) die(`api.md: a block under "### ${heading}" names no file — teach this script its shape`);
  // The handler calls data-layer functions (listExamples, …) the project writes itself.
  if (path.startsWith("app/api/")) continue;
  put(join("src", path.replace("<owner>", "features/example")), code);
  written["api.md"]++;
}

// component.md: each heading is a filename inside the component's folder.
for (const { heading, code } of blocks("component.md")) {
  const file = heading.match(/`([^`]+)`/)?.[1];
  if (!file) die(`component.md: a block under "### ${heading}" names no file — teach this script its shape`);
  put(join("src/shared/components/SummaryCard", file), code);
  written["component.md"]++;
}

// A check that wrote nothing would pass having checked nothing (.agents/docs/DECISIONS.md #16).
for (const [file, n] of Object.entries(written)) if (!n) die(`${file}: no code blocks found`);

// Phase 01's modules, at the paths the templates import, with the smallest honest signatures.
const STUBS = {
  "src/core/api/api-error.ts":
    "export async function toApiError(response: Response) {\n  return new Error(`api ${response.status}`);\n}\n",
  "src/core/config/env.ts": "export const env = { useMocks: false };\n",
  "src/shared/utils/cn.ts":
    'export const cn = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");\n',
  "src/shared/utils/classMap.ts":
    'export const NO_CLASS = "";\nexport function classMap<T>(_component: string, map: T): T {\n  return map;\n}\n',
  "src/shared/utils/keysOf.ts":
    "export function keysOf<T extends Record<string, unknown>>(strings: T) {\n" +
    "  return Object.fromEntries(Object.keys(strings).map((k) => [k, k])) as { [K in keyof T]: K };\n}\n",
};
for (const [rel, body] of Object.entries(STUBS)) if (!existsSync(join(project, rel))) put(rel, body);

console.log(`check-templates: ${written["api.md"]} file(s) from api.md, ${written["component.md"]} from component.md`);

// The scaffold's own tools, run by node itself: no npm/npx shim to spawn on Windows (05 §4).
const tools = [
  ["tsc", "node_modules/typescript/bin/tsc", ["--noEmit"]],
  ["eslint", "node_modules/eslint/bin/eslint.js", ["src"]],
  ["guard", ".agents/cli.mjs", ["check", "--only=styles"]],
];
let failed = 0;
for (const [name, entry, args] of tools) {
  try {
    execFileSync(process.execPath, [join(project, entry), ...args], { cwd: project, stdio: "inherit" });
    console.log(`check-templates: ${name} clean`);
  } catch {
    failed++;
    console.error(`check-templates: ${name} failed on the templates — fix the template, not this script`);
  }
}
process.exit(failed ? 1 : 0);
