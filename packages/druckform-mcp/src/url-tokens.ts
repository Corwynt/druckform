import crypto from "node:crypto";

const TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

interface UrlToken {
  jobId: string;
  kind: "upload" | "download";
  expiresAt: number;
}

const tokens = new Map<string, UrlToken>();

export function generateToken(jobId: string, kind: "upload" | "download"): string {
  const token = crypto.randomBytes(32).toString("hex");
  tokens.set(token, {
    jobId,
    kind,
    expiresAt: Date.now() + TOKEN_TTL_MS,
  });
  return token;
}

export interface TokenValidation {
  valid: boolean;
  jobId?: string;
  reason?: string;
}

export function validateToken(token: string, expectedKind: "upload" | "download"): TokenValidation {
  const entry = tokens.get(token);
  if (!entry) return { valid: false, reason: "Unknown token" };
  if (entry.expiresAt < Date.now()) {
    tokens.delete(token);
    return { valid: false, reason: "Token expired" };
  }
  if (entry.kind !== expectedKind) {
    return { valid: false, reason: `Token is for ${entry.kind}, not ${expectedKind}` };
  }
  return { valid: true, jobId: entry.jobId };
}

export function consumeToken(token: string): void {
  tokens.delete(token);
}
