import { describe, expect, it } from "vitest";
import { generateToken, validateToken, consumeToken } from "../src/url-tokens.js";

describe("url-tokens", () => {
  it("generates a valid upload token", () => {
    const tok = generateToken("job-1", "upload");
    const result = validateToken(tok, "upload");
    expect(result.valid).toBe(true);
    expect(result.jobId).toBe("job-1");
  });

  it("rejects a token used for the wrong kind", () => {
    const tok = generateToken("job-2", "upload");
    const result = validateToken(tok, "download");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("upload");
  });

  it("rejects an unknown token", () => {
    const result = validateToken("not-a-real-token", "upload");
    expect(result.valid).toBe(false);
  });

  it("consumeToken removes the token so it cannot be reused", () => {
    const tok = generateToken("job-3", "download");
    consumeToken(tok);
    const result = validateToken(tok, "download");
    expect(result.valid).toBe(false);
  });
});
