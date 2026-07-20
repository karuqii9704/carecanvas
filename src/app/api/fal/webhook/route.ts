import { NextResponse } from "next/server";

import { falWebhookSchema } from "@/domain/job";
import { inngest } from "@/inngest/client";
import { readFalSignatureHeaders, verifyFalWebhook } from "@/server/security/fal-webhook";

function extractImageUrl(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const images = Reflect.get(payload, "images");
  if (!Array.isArray(images) || !images[0] || typeof images[0] !== "object") return null;
  const url = Reflect.get(images[0], "url");
  return typeof url === "string" && url.startsWith("https://") ? url : null;
}

export async function POST(request: Request) {
  const signatureHeaders = readFalSignatureHeaders(request.headers);
  if (!signatureHeaders) return NextResponse.json({ error: "Missing fal signature headers." }, { status: 401 });
  const rawBody = new Uint8Array(await request.arrayBuffer());
  let valid = false;
  try {
    valid = await verifyFalWebhook(signatureHeaders, rawBody);
  } catch {
    return NextResponse.json({ error: "Webhook verification unavailable." }, { status: 503 });
  }
  if (!valid) return NextResponse.json({ error: "Invalid or replayed fal webhook." }, { status: 401 });

  try {
    const payload = falWebhookSchema.parse(JSON.parse(new TextDecoder().decode(rawBody)));
    if (payload.request_id !== signatureHeaders.requestId) {
      return NextResponse.json({ error: "Request ID mismatch." }, { status: 400 });
    }
    if (payload.status === "ERROR") {
      await inngest.send({
        name: "carecanvas/fal.failed",
        data: { providerRequestId: payload.request_id, error: payload.error ?? "fal generation failed" },
      });
      return NextResponse.json({ accepted: true });
    }
    const outputUrl = extractImageUrl(payload.payload);
    if (!outputUrl) return NextResponse.json({ error: "Webhook has no valid HTTPS image URL." }, { status: 400 });
    await inngest.send({
      name: "carecanvas/fal.completed",
      data: { providerRequestId: payload.request_id, outputUrl },
    });
    return NextResponse.json({ accepted: true });
  } catch {
    return NextResponse.json({ error: "Malformed fal webhook body." }, { status: 400 });
  }
}
