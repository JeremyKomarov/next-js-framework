// Deliberately no component rendering. Adding jsdom and a testing library is a real decision with
// real maintenance, and it is not what is usually missing — what is missing is any check at all
// on the logic that decides what a person sees when something fails.
//
// See .agents/docs/05-WORKFLOW.md §3.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Duplicated from tsconfig rather than adding a plugin to read it. Must track
    // tsconfig's "@/*": ["./src/*"] — a drifting alias fails as "cannot find module".
    alias: [
      { find: /^@\/(.*)$/, replacement: fileURLToPath(new URL("./src/", import.meta.url)) + "$1" },
    ],
  },
  test: {
    environment: "node",
    // A new project has no tests yet, and `npm run verify` is the gate from the first commit.
    passWithNoTests: true,
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
  },
});
