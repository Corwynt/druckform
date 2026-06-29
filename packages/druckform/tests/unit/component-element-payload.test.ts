import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadComponent } from "../../src/component/loader.js";

const FIX = path.resolve(import.meta.dirname, "../fixtures/components/echo-hr.ts");
const ctx = { token: (n: string) => `\\${n}`, style: { colors: {}, fonts: {}, spacing: {} } };

describe("component render receives BlockElement payload", () => {
  it("passes the element through to a TS component", async () => {
    const def = await loadComponent(FIX, "");
    expect(def.render({}, "", ctx, { kind: "hr" })).toBe("KIND:hr");
  });

  it("leaves element undefined for ordinary calls", async () => {
    const def = await loadComponent(FIX, "");
    expect(def.render({}, "", ctx)).toBe("NO-ELEMENT");
  });
});
