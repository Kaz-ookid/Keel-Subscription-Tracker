// Sanity checks over the brand bank — a hand-curated ~200-entry constant is
// exactly the kind of data a typo slips into unnoticed.

import { describe, expect, it } from "vitest";
import { DEFAULT_CATEGORIES, SUGGESTED_COMMITMENTS, SUGGESTION_CATEGORY_ORDER } from "../index";

describe("SUGGESTED_COMMITMENTS", () => {
  it("has globally unique ids", () => {
    const ids = SUGGESTED_COMMITMENTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("only references existing default categories", () => {
    const known = new Set(DEFAULT_CATEGORIES.map((c) => c.id));
    for (const s of SUGGESTED_COMMITMENTS) {
      if (s.categoryId) expect(known, `${s.id} → ${s.categoryId}`).toContain(s.categoryId);
    }
  });

  it("uses valid units, colors, domains and region codes", () => {
    for (const s of SUGGESTED_COMMITMENTS) {
      expect(["month", "year"], s.id).toContain(s.unit);
      if (s.color) expect(s.color, s.id).toMatch(/^#[0-9A-F]{6}$/);
      // Bare hostname — no protocol, no path, at least one dot.
      if (s.domain) expect(s.domain, s.id).toMatch(/^[a-z0-9.-]+\.[a-z]{2,}$/);
      for (const r of s.regions ?? []) expect(r, s.id).toMatch(/^[A-Z]{2}$/);
    }
  });

  it("orders sections over known categories, ending in a catch-all", () => {
    const known = new Set(DEFAULT_CATEGORIES.map((c) => c.id));
    for (const id of SUGGESTION_CATEGORY_ORDER) expect(known).toContain(id);
    // Every catalog category is reachable in the picker's section order.
    for (const s of SUGGESTED_COMMITMENTS) {
      if (s.categoryId) expect(SUGGESTION_CATEGORY_ORDER).toContain(s.categoryId);
    }
  });
});
