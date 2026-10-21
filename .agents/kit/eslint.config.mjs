// The layering rules from .agents/docs/01-STRUCTURE.md, made mechanical.
//
// A rulebook only a reviewer checks decays quietly, and the layering rules decay first — breaking
// them is always the convenient thing to do in the moment. Everything here is one of those.
//
// Note on flat config: an `overrides` block REPLACES a rule rather than merging with it, so every
// block must re-list the base patterns it still wants. That is why the zones below are named
// consts recombined per block instead of written inline.
import { readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const here = dirname(fileURLToPath(import.meta.url));

// Read from disk so adding a feature never means editing this file. Paths below are
// relative to this config, which sits at the root — the app itself lives under src/ (01 §1).
const FEATURES = existsSync(join(here, "src/features"))
  ? readdirSync(join(here, "src/features"), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
  : [];

// -- restriction zones -------------------------------------------------------

const RELATIVE_PARENT = {
  group: ["../*", "../**"],
  message:
    "01-STRUCTURE.md §6: use the @/ alias for anything outside this folder. A ../ chain breaks " +
    "when a file moves and hides what a component really depends on.",
};

const NO_FEATURES = {
  group: ["@/features/*", "@/features/**"],
  message:
    "01-STRUCTURE.md §1: shared/, core/ and store/ are the layers features depend on — they must " +
    "not depend back on one. Take what you need as a prop or a slot, or move the shared thing " +
    "down into shared/.",
};

const NO_SERVER = {
  group: ["@/server/*", "@/server/**"],
  message:
    "01-STRUCTURE.md §8: server modules belong to Route Handlers, layouts and middleware. Importing " +
    "one from a component or a store risks credentials in the browser bundle — go through a " +
    "Route Handler.",
};

// NO_SERVER already covers server/db/ for the browser layers, so this is the narrower rule the
// other half of 01 §8 needs: even code that MAY reach the server imports a repo function, never the
// client itself. Only server/db/ is exempt.
const NO_DB_CLIENT = {
  group: ["@/server/db/client", "@/server/db/client.*"],
  message:
    "01-STRUCTURE.md §8: server/db/ is the only place a database client is constructed. Import a " +
    "named async function from a *.repo.ts instead.",
};

const NO_SCSS_MODULE = {
  group: ["*.module.scss", "./*.module.scss", "**/*.module.scss"],
  message:
    "02-COMPONENTS.md §2: a component's SCSS module is imported by exactly one file, its " +
    "<Component>.classes.ts. Read class names from that map so a typo cannot silently render " +
    "nothing.",
};

// Icons come from exactly one library, wrapped by exactly one component (DECISIONS.md #23) — the
// same chokepoint shape as NO_DB_CLIENT: everywhere may render an icon, nowhere but the wrapper
// may import the library that draws it.
const NO_ICON_LIBRARY = {
  group: ["lucide-react", "lucide-react/*"],
  message:
    "02-COMPONENTS.md §6a: icons come from lucide-react through shared/components/Icon, never a " +
    "direct import. A second entry point is how a project ends up with two icon sets that stop " +
    "matching.",
};

const BASE = [RELATIVE_PARENT, NO_SCSS_MODULE, NO_DB_CLIENT, NO_ICON_LIBRARY];

export default [
  // eslint-config-next ships flat config from v16. Do NOT wrap these in FlatCompat — it throws
  // "Converting circular structure to JSON" on the react plugin.
  ...nextCoreWebVitals,
  ...nextTypescript,

  {
    ignores: ["node_modules/**", ".next/**", "next-env.d.ts", ".agents/**", "**/*.mjs"],
  },

  // -- everything ------------------------------------------------------------
  {
    rules: {
      "no-restricted-imports": ["error", { patterns: BASE }],

      "no-restricted-syntax": [
        "error",
        {
          selector:
            "MemberExpression[object.object.name='process'][object.property.name='env']" +
            "[property.name=/^NEXT_PUBLIC_/]",
          message:
            "01-STRUCTURE.md §8: read the public environment through core/config/env.ts, so a " +
            "missing value fails once, loudly, and in one place.",
        },
      ],

      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
    },
  },

  // -- the layers below features never depend back on one --------------------
  {
    files: ["src/shared/**", "src/core/**", "src/store/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [...BASE, NO_FEATURES, NO_SERVER] }],
    },
  },

  // The one declared exception: mapping i18n namespaces to feature-owned strings files is this
  // file's entire job (02-COMPONENTS.md §9).
  {
    files: ["src/core/i18n/messages.ts"],
    rules: { "no-restricted-imports": ["error", { patterns: BASE }] },
  },

  // -- a feature never imports another feature -------------------------------
  // One block per feature, banning the others by name. Twelve lines for the whole firewall.
  ...FEATURES.map((feature) => ({
    files: [`src/features/${feature}/**`],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...BASE,
            NO_SERVER,
            ...FEATURES.filter((other) => other !== feature).map((other) => ({
              group: [`@/features/${other}/*`, `@/features/${other}/**`],
              message:
                `01-STRUCTURE.md §1: features/${feature} must not import features/${other}. ` +
                `If both need this, it belongs in shared/ — promoted, not cross-imported.`,
            })),
          ],
        },
      ],
    },
  })),

  // -- routes, middleware and the server may reach the server ----------------
  // They still may not construct a database client — that is server/db/'s job alone.
  {
    files: ["src/app/**", "src/middleware.ts", "src/server/**"],
    rules: { "no-restricted-imports": ["error", { patterns: BASE }] },
  },

  // server/db/ is where the client lives, so it is the one place that may import one.
  {
    files: ["src/server/db/**"],
    rules: { "no-restricted-imports": ["error", { patterns: [RELATIVE_PARENT] }] },
  },

  // shared/components/Icon/ is where lucide-react is imported, so it is the one place exempt from
  // NO_ICON_LIBRARY — every other restriction on a shared/ file still applies (02-COMPONENTS.md §6a).
  {
    files: ["src/shared/components/Icon/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [RELATIVE_PARENT, NO_SCSS_MODULE, NO_DB_CLIENT, NO_FEATURES, NO_SERVER] },
      ],
    },
  },

  // -- the chokepoint exempts itself -----------------------------------------
  {
    files: ["src/core/config/env.ts"],
    rules: { "no-restricted-syntax": "off" },
  },

  // -- the only file type allowed to import a stylesheet ---------------------
  {
    files: ["**/*.classes.ts"],
    rules: { "no-restricted-imports": ["error", { patterns: [RELATIVE_PARENT, NO_DB_CLIENT] }] },
  },
];
