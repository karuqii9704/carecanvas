import { describe, expect, it } from "vitest";

import { approvalSchema, assertTransition, createJobSchema, isTerminalStatus, redactProviderId } from "@/domain/job";

const validInput = {
  title: "Calm activity card",
  prompt: "Replace the central figure with a friendly turtle and retain the quiet reading nook.",
  audience: "children-6-9" as const,
  mode: "img2img" as const,
  inputUrl: "/assets/carecanvas-source.svg",
  simulateFirstQaFailure: false,
};

describe("CareCanvas domain contracts", () => {
  it("accepts a bounded image-to-image request", () => {
    expect(createJobSchema.parse(validInput)).toMatchObject({ mode: "img2img" });
  });

  it("requires a mask for inpainting", () => {
    const result = createJobSchema.safeParse({ ...validInput, mode: "inpaint" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid state transitions", () => {
    expect(() => assertTransition("draft", "completed")).toThrow(/draft -> completed/);
    expect(() => assertTransition("qa_review", "completed")).not.toThrow();
  });

  it("identifies terminal states", () => {
    expect(isTerminalStatus("completed")).toBe(true);
    expect(isTerminalStatus("awaiting_approval")).toBe(false);
  });

  it("redacts provider identifiers for client traces", () => {
    expect(redactProviderId("fal_request_1234567890")).toBe("fal_••••7890");
  });

  it("bounds approval notes", () => {
    expect(approvalSchema.safeParse({ decision: "approved", note: "a".repeat(281) }).success).toBe(false);
  });
});
