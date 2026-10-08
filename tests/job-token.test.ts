import { describe, expect, it } from "vitest";

import { seedJob } from "@/domain/demo-data";
import type { ServerEnv } from "@/server/env";
import { signJobToken, verifyJobToken } from "@/server/security/job-token";

const env = { CARECANVAS_STATE_SECRET: "test-secret" } as ServerEnv;
const job = { ...seedJob, status: "awaiting_approval" as const };
const expected = { id: job.id, ownerId: job.ownerId };

describe("signed job snapshot", () => {
  it("lets another instance resume the exact job", () => {
    expect(verifyJobToken(env, signJobToken(env, job), expected)).toEqual(job);
  });

  it("rejects an altered snapshot", () => {
    const [body, signature] = signJobToken(env, job).split(".");
    const forged = JSON.parse(Buffer.from(body!, "base64url").toString("utf8"));
    forged.job.prompt = "Something the safety agent never reviewed at all.";
    const tampered = `${Buffer.from(JSON.stringify(forged)).toString("base64url")}.${signature}`;
    expect(verifyJobToken(env, tampered, expected)).toBeNull();
  });

  it("rejects a different key, job, owner, or an expired token", () => {
    const token = signJobToken(env, job, 1_000);
    expect(verifyJobToken({ ...env, CARECANVAS_STATE_SECRET: "other" }, token, expected, 2_000)).toBeNull();
    expect(verifyJobToken(env, token, { ...expected, id: "another" }, 2_000)).toBeNull();
    expect(verifyJobToken(env, token, { ...expected, ownerId: "another" }, 2_000)).toBeNull();
    expect(verifyJobToken(env, token, expected, 1_000 + 25 * 60 * 60 * 1000)).toBeNull();
    expect(verifyJobToken(env, token, expected, 2_000)).toEqual(job);
  });

  it("rejects garbage", () => {
    expect(verifyJobToken(env, "not-a-token", expected)).toBeNull();
    expect(verifyJobToken(env, "a.b.c", expected)).toBeNull();
  });
});
