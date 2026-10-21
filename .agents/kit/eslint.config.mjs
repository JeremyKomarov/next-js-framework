// The layering rules from .agents/docs/01-STRUCTURE.md, made mechanical.
//
// A rulebook only a reviewer checks decays quietly, and the layering rules decay first — breaking
// them is always the convenient thing to do in the moment. Everything here is one of those.
//
// Note on flat config: a later block REPLACES a rule rather than merging with it, so every block
// must re-list the base patterns it still wants. That is why the zones below are named consts
// recombined per block instead of written inline, and why restrict() writes each zone twice.
//
// The framework's CI proves every zone both ways inside a real project (bin/check-lint.mjs).
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

// Every zone names a folder's root as well as what is in it: `@/features/billing/*` alone let
// `@/features/billing` — a feature's index, the most natural import there is — straight through.
const NO_FEATURES = {
  group: ["@/features", "@/features/*", "@/features/**"],
  message:
    "01-STRUCTURE.md §1: shared/, core/ and store/ are the layers features depend on — they must " +
    "not depend back on one. Take what you need as a prop or a slot, or move the shared thing " +
    "down into shared/.",
};

const NO_SERVER = {
  group: ["@/server", "@/server/*", "@/server/**"],
  message:
    "01-STRUCTURE.md §8: server modules belong to Route Handlers, layouts and the proxy. Importing " +
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

// Icons come from exactly one library, wrapped by exactly one component — the same chokepoint
// shape as NO_DB_CLIENT: everywhere may render an icon, nowhere but the wrapper may import the
// library that draws it (.agents/docs/DECISIONS.md #23).
const NO_ICON_LIBRARY = {
  group: ["lucide-react", "lucide-react/*"],
  message:
    "02-COMPONENTS.md §6a: icons come from lucide-react through shared/components/Icon, never a " +
    "direct import. A second entry point is how a project ends up with two icon sets that stop " +
    "matching.",
};

const BASE = [RELATIVE_PARENT, NO_SCSS_MODULE, NO_DB_CLIENT, NO_ICON_LIBRARY];

// A zone, and the same zone for the class maps inside it. A *.classes.ts is the one file allowed
// to import its stylesheet (02-COMPONENTS.md §2), and nothing else about its layer changes. One
// trailing block for every class map used to replace the whole firewall for them, so a class map
// could import another feature, or server/ (.agents/docs/DECISIONS.md #35).
const restrict = (files, patterns) => {
  const rule = (p) => ({ "no-restricted-imports": ["error", { patterns: p }] });
  // Without `files` a block applies to everything already linted; a `files` of "**" would make
  // ESLint try to parse every stylesheet and markdown file too.
  const maps = files ? files.filter((f) => f.endsWith("/**")).map((f) => `${f}/*.classes.ts`)
                     : ["**/*.classes.ts"];
  const forMaps = patterns.filter((p) => p !== NO_SCSS_MODULE);
  return [
    { ...(files && { files }), rules: rule(patterns) },
    ...(maps.length ? [{ files: maps, rules: rule(forMaps) }] : []),
  ];
};

export default [
  // eslint-config-next ships flat config from v16. Do NOT wrap these in FlatCompat — it throws
  // "Converting circular structure to JSON" on the react plugin.
  ...nextCoreWebVitals,
  ...nextTypescript,

  {
    ignores: ["node_modules/**", ".next/**", "next-env.d.ts", ".agents/**", "**/*.mjs"],
  },

  // -- everything ------------------------------------------------------------
  ...restrict(undefined, BASE),
  {
    rules: {
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
  ...restrict(["src/shared/**", "src/core/**", "src/store/**"], [...BASE, NO_FEATURES, NO_SERVER]),

  // The one declared exception: mapping i18n namespaces to feature-owned strings files is this
  // file's entire job (02-COMPONENTS.md §9). It is still core/, so server/ stays out of reach.
  ...restrict(["src/core/i18n/messages.ts"], [...BASE, NO_SERVER]),

  // -- a feature never imports another feature -------------------------------
  // One zone per feature, banning the others by name — the root of each as well as what is in it.
  ...FEATURES.flatMap((feature) => restrict([`src/features/${feature}/**`], [
    ...BASE,
    NO_SERVER,
    ...FEATURES.filter((other) => other !== feature).map((other) => ({
      group: [`@/features/${other}`, `@/features/${other}/*`, `@/features/${other}/**`],
      message:
        `01-STRUCTURE.md §1: features/${feature} must not import features/${other}. ` +
        `If both need this, it belongs in shared/ — promoted, not cross-imported.`,
    })),
  ])),

  // -- routes, the proxy and the server may reach the server -----------------
  // Next 16 renamed middleware.ts to proxy.ts; both are listed. They still may not construct a
  // database client — that is server/db/'s job alone.
  ...restrict(["src/app/**", "src/proxy.ts", "src/middleware.ts", "src/server/**"], BASE),

  // server/db/ is where the client lives, so it is the one place that may import one.
  ...restrict(["src/server/db/**"], [RELATIVE_PARENT]),

  // shared/components/Icon/ is where lucide-react is imported, so it is the one place exempt from
  // NO_ICON_LIBRARY — every other restriction on a shared/ file still applies (02-COMPONENTS.md §6a).
  ...restrict(["src/shared/components/Icon/**"],
    [RELATIVE_PARENT, NO_SCSS_MODULE, NO_DB_CLIENT, NO_FEATURES, NO_SERVER]),

  // -- the chokepoint exempts itself -----------------------------------------
  {
    files: ["src/core/config/env.ts"],
    rules: { "no-restricted-syntax": "off" },
  },
];
