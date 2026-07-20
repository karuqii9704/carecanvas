import { InngestTestEngine } from "@inngest/test";
import { describe, expect, it } from "vitest";

import { seedJob } from "@/domain/demo-data";
import { orchestrateIllustration } from "@/inngest/functions";

describe("Inngest human-gated orchestration", () => {
  it("registers the correlated human approval wait", async () => {
    const awaiting = { ...seedJob, status: "awaiting_approval" as const, attempts: 0, outputUrl: undefined };
    const engine = new InngestTestEngine({ function: orchestrateIllustration });
    const { result, ctx } = await engine.executeStep("wait-for-human-approval", {
      events: [{ name: "carecanvas/job.requested", data: { jobId: awaiting.id, ownerId: awaiting.ownerId } }],
      steps: [{ id: "prepare-agents", handler: () => awaiting }],
    });
    expect(result).toBeUndefined();
    expect(ctx.step.waitForEvent).toHaveBeenCalledWith("wait-for-human-approval", {
      event: "carecanvas/approval.responded",
      timeout: "24h",
      if: "async.data.jobId == event.data.jobId",
    });
  });
});
