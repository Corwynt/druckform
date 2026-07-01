import { describe, expect, it } from "vitest";
import * as druckform from "../../src/index.js";

describe("druckform barrel exports", () => {
  it("re-exports z from zod as a runtime value", () => {
    expect(typeof druckform.z).toBe("object");
    expect(typeof druckform.z.object).toBe("function");
    expect(typeof druckform.z.string).toBe("function");
  });

  it("still exports the existing SDK helpers", () => {
    expect(typeof druckform.escapeTeX).toBe("function");
    expect(typeof druckform.raw).toBe("function");
    expect(typeof druckform.tokenRef).toBe("function");
  });
});
