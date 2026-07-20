import "server-only";

import { createHash, createPublicKey, verify } from "node:crypto";

type FalJwk = { kty: "OKP"; crv: "Ed25519"; x: string; kid?: string };
type JwksResponse = { keys: FalJwk[] };

const JWKS_URL = "https://rest.fal.ai/.well-known/jwks.json";
const MAX_AGE_SECONDS = 300;
const CACHE_MS = 23 * 60 * 60 * 1000;

let cache: { keys: FalJwk[]; fetchedAt: number } | undefined;
const seenRequests = new Map<string, number>();

export type FalSignatureHeaders = {
  requestId: string;
  userId: string;
  timestamp: string;
  signature: string;
};

export function readFalSignatureHeaders(headers: Headers): FalSignatureHeaders | null {
  const requestId = headers.get("x-fal-webhook-request-id");
  const userId = headers.get("x-fal-webhook-user-id");
  const timestamp = headers.get("x-fal-webhook-timestamp");
  const signature = headers.get("x-fal-webhook-signature");
  return requestId && userId && timestamp && signature ? { requestId, userId, timestamp, signature } : null;
}

async function fetchKeys(nowMs: number): Promise<FalJwk[]> {
  if (cache && nowMs - cache.fetchedAt < CACHE_MS) return cache.keys;
  const response = await fetch(JWKS_URL, { signal: AbortSignal.timeout(10_000), cache: "no-store" });
  if (!response.ok) throw new Error(`fal JWKS request failed with ${response.status}`);
  const payload = (await response.json()) as JwksResponse;
  const keys = payload.keys.filter((key) => key.kty === "OKP" && key.crv === "Ed25519" && typeof key.x === "string");
  if (!keys.length) throw new Error("fal JWKS response contained no Ed25519 keys.");
  cache = { keys, fetchedAt: nowMs };
  return keys;
}

function isHex(value: string): boolean {
  return value.length === 128 && /^[0-9a-f]+$/i.test(value);
}

export async function verifyFalWebhook(
  signatureHeaders: FalSignatureHeaders,
  rawBody: Uint8Array,
  options: { nowMs?: number; keys?: FalJwk[]; trackReplay?: boolean } = {},
): Promise<boolean> {
  const nowMs = options.nowMs ?? Date.now();
  const timestamp = Number.parseInt(signatureHeaders.timestamp, 10);
  if (!Number.isSafeInteger(timestamp) || Math.abs(Math.floor(nowMs / 1000) - timestamp) > MAX_AGE_SECONDS) return false;
  if (!isHex(signatureHeaders.signature)) return false;

  for (const [requestId, expiresAt] of seenRequests) {
    if (expiresAt <= nowMs) seenRequests.delete(requestId);
  }
  const replayKey = `${signatureHeaders.userId}:${signatureHeaders.requestId}:${signatureHeaders.timestamp}`;
  if (options.trackReplay !== false && seenRequests.has(replayKey)) return false;

  const digest = createHash("sha256").update(rawBody).digest("hex");
  const message = Buffer.from(
    [signatureHeaders.requestId, signatureHeaders.userId, signatureHeaders.timestamp, digest].join("\n"),
    "utf8",
  );
  const signature = Buffer.from(signatureHeaders.signature, "hex");
  const keys = options.keys ?? (await fetchKeys(nowMs));
  const valid = keys.some((key) => {
    try {
      return verify(null, message, createPublicKey({ key, format: "jwk" }), signature);
    } catch {
      return false;
    }
  });
  if (valid && options.trackReplay !== false) seenRequests.set(replayKey, nowMs + MAX_AGE_SECONDS * 1000);
  return valid;
}
