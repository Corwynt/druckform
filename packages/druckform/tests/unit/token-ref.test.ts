import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { loadComponent } from "../../src/component/loader.js";
import { tokenRef } from "../../src/sdk/token-ref.js";

const FIX = path.resolve(import.meta.dirname, "../fixtures/components/token-ref-comp.ts");

describe("tokenRef", () => {
  it("validates as a string at runtime", () => {
    expect(z.object({ a: tokenRef("accent") }).parse({ a: "x" })).toEqual({ a: "x" });
  });

  it("a TS component derives requiredTokens from tokenRef params", async () => {
    const def = await loadComponent(FIX, "");
    expect(def.requiredTokens.has("accent")).toBe(true);
    expect(def.requiredTokens.has("title")).toBe(false);
  });
});
