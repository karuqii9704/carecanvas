import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { careJobSchema, type CareJob } from "@/domain/job";
import type { ServerEnv } from "@/server/env";

/**
 * Outside `live`, jobs live in process memory. On serverless hosting the
 * request that creates a job and the request that approves it can land on
 * different instances, so the approval would find nothing. The server
 * therefore hands the browser an HMAC-signed snapshot of the job; any
 * instance can verify it and resume the run without shared storage.
 */

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_JOB_TOKEN_LENGTH = 64_000;

type TokenPayload = { v: 1; iat: number; job: CareJob };

function signingKey(env: ServerEnv): Buffer {
  // Prefer a dedicated secret; otherwise derive one from a server-only provider key.
  // The public demo has neither and makes no external calls, so a fixed key only
  // lets a visitor tamper with their own deterministic run.
  const material = env.CARECANVAS_STATE_SECRET ?? env.GEMINI_API_KEY ?? env.ANTHROPIC_API_KEY ?? "carecanvas-public-demo";
  return createHmac("sha256", "carecanvas/job-state/v1").update(material).digest();
}

function mac(env: ServerEnv, body: string): Buffer {
  return createHmac("sha256", signingKey(env)).update(body).digest();
}

export function signJobToken(env: ServerEnv, job: CareJob, now = Date.now()): string {
  const payload: TokenPayload = { v: 1, iat: now, job };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${mac(env, body).toString("base64url")}`;
}

/** Returns the signed job, or null when the token is malformed, altered, expired, or for someone else. */
export function verifyJobToken(env: ServerEnv, token: string, expected: { id: string; ownerId: string }, now = Date.now()): CareJob | null {
  if (token.length > MAX_JOB_TOKEN_LENGTH) return null;
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra !== undefined) return null;
  const given = Buffer.from(signature, "base64url");
  const wanted = mac(env, body);
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<TokenPayload>;
    if (payload.v !== 1 || typeof payload.iat !== "number" || now - payload.iat > TOKEN_TTL_MS || payload.iat - now > 60_000) return null;
    const job = careJobSchema.parse(payload.job);
    if (job.id !== expected.id || job.ownerId !== expected.ownerId) return null;
    return job;
  } catch {
    return null;
  }
}
