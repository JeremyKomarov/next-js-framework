// The most transferable test in this framework. Copy its shape for any registry you add.
//
// These assert things the type system cannot state: two features can be typed perfectly and both
// claim "/plan", which breaks the sidebar's active-link matching and sends one of them to the
// other's screen. See .agents/docs/05-WORKFLOW.md §3.
import { describe, expect, it } from "vitest";
import { FEATURES, FEATURE_KEYS, type FeatureKey, isFeatureEnabled } from "@/core/config/features.const";
import { ROUTES } from "@/core/constants/routes.const";

const keys = Object.values(FEATURE_KEYS) as FeatureKey[];

describe("the feature registry", () => {
  it("defines every key it declares, and declares every key it defines", () => {
    expect(Object.keys(FEATURES).sort()).toEqual([...keys].sort());
  });

  it("gives every feature a distinct route", () => {
    const routes = keys.map((key) => FEATURES[key].route);

    expect(new Set(routes).size).toBe(routes.length);
  });

  it("gives every feature an absolute route", () => {
    for (const key of keys) {
      // The third argument labels which key failed, rather than just which assertion.
      expect(FEATURES[key].route, key).toMatch(/^\//);
    }
  });

  it("derives ROUTES from the registry rather than repeating it", () => {
    for (const key of keys) {
      expect(ROUTES[key]).toBe(FEATURES[key].route);
    }
  });

  it("reports the flag it was given", () => {
    for (const key of keys) {
      expect(isFeatureEnabled(key), key).toBe(FEATURES[key].enabled);
    }
  });
});
