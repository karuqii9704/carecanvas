import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";

import { verifyFalWebhook, type FalSignatureHeaders } from "@/server/security/fal-webhook";

function fixture(bodyText = '{"request_id":"req-1","status":"OK"}') {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const nowMs = Date.parse("2026-07-20T08:00:00Z");
  const timestamp = String(Math.floor(nowMs / 1000));
  const body = Buffer.from(bodyText);
  const digest = createHash("sha256").update(body).digest("hex");
  const message = Buffer.from(["req-1", "user-1", timestamp, digest].join("\n"));
  const signature = sign(null, message, privateKey).toString("hex");
  const headers: FalSignatureHeaders = { requestId: "req-1", userId: "user-1", timestamp, signature };
  const jwk = publicKey.export({ format: "jwk" });
  const key = { kty: "OKP" as const, crv: "Ed25519" as const, x: jwk.x! };
  return { body, headers, key, nowMs };
}

describe("fal webhook verification", () => {
  it("accepts a valid Ed25519 signature", async () => {
    const { body, headers, key, nowMs } = fixture();
    await expect(verifyFalWebhook(headers, body, { keys: [key], nowMs, trackReplay: false })).resolves.toBe(true);
  });

  it("rejects an altered raw body", async () => {
    const { headers, key, nowMs } = fixture();
    await expect(verifyFalWebhook(headers, Buffer.from("altered"), { keys: [key], nowMs, trackReplay: false })).resolves.toBe(false);
  });

  it("rejects stale timestamps", async () => {
    const { body, headers, key, nowMs } = fixture();
    await expect(verifyFalWebhook(headers, body, { keys: [key], nowMs: nowMs + 301_000, trackReplay: false })).resolves.toBe(false);
  });

  it("rejects a replayed valid request", async () => {
    const { body, headers, key, nowMs } = fixture();
    await expect(verifyFalWebhook(headers, body, { keys: [key], nowMs })).resolves.toBe(true);
    await expect(verifyFalWebhook(headers, body, { keys: [key], nowMs })).resolves.toBe(false);
  });
});
