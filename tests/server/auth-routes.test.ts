import { describe, expect, it } from "vitest";
import { isProtectedPath, loginRedirect, safeNextPath } from "@/server/auth/routes";

describe("isProtectedPath", () => {
  it("protects the app pages and anything under them", () => {
    for (const p of ["/dashboard", "/plan", "/today", "/shopping-list", "/onboarding", "/recipes/abc123"]) {
      expect(isProtectedPath(p)).toBe(true);
    }
  });
  it("leaves public pages alone, including look-alikes", () => {
    for (const p of ["/", "/login", "/planet", "/todayish", "/api/plan", "/recipesx"]) {
      expect(isProtectedPath(p)).toBe(false);
    }
  });
});

describe("loginRedirect", () => {
  it("sends the visitor to login and remembers where they were going", () => {
    expect(loginRedirect("/plan", "?week=2026-11-23")).toBe("/login?next=%2Fplan%3Fweek%3D2026-11-23");
    expect(loginRedirect("/today")).toBe("/login?next=%2Ftoday");
  });
  it("never remembers an off-site target", () => {
    expect(loginRedirect("//evil.example.com")).toBe("/login");
    expect(loginRedirect("/\\evil")).toBe("/login");
  });
});

describe("safeNextPath", () => {
  it("accepts same-site paths", () => {
    expect(safeNextPath("/plan?x=1")).toBe("/plan?x=1");
  });
  it("falls back for anything else", () => {
    for (const bad of [null, undefined, "", "https://evil.example.com", "//evil.example.com", "/\\evil", "javascript:alert(1)"]) {
      expect(safeNextPath(bad)).toBe("/today");
    }
    expect(safeNextPath("nope", "/dashboard")).toBe("/dashboard");
  });
});
