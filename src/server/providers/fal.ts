import "server-only";

import { createFalClient } from "@fal-ai/client";

import type { CareJob, SceneBrief } from "@/domain/job";
import type { GenerationSubmission, ImageProvider } from "@/server/providers/contracts";

type QueueSubmit = (
  endpoint: string,
  options: { input: Record<string, unknown>; webhookUrl: string },
) => Promise<{ request_id: string }>;

export class FalImageProvider implements ImageProvider {
  private readonly submitToQueue: QueueSubmit;

  constructor(key: string, private readonly webhookUrl: string) {
    const client = createFalClient({ credentials: key });
    this.submitToQueue = client.queue.submit.bind(client.queue) as unknown as QueueSubmit;
  }

  async submit(job: CareJob, brief: SceneBrief, attempt: number): Promise<GenerationSubmission> {
    const correction = attempt > 1 && job.qaReview?.correction ? ` Correction: ${job.qaReview.correction}` : "";
    const prompt = `${brief.refinedPrompt}${correction}`;
    const endpoint = job.mode === "inpaint" ? "fal-ai/flux-pro/v1/fill" : "fal-ai/flux-pro/kontext";
    const input =
      job.mode === "inpaint"
        ? { image_url: job.inputUrl, mask_url: job.maskUrl, prompt, output_format: "png" }
        : { image_url: job.inputUrl, prompt, output_format: "png", safety_tolerance: "2" };
    const result = await this.submitToQueue(endpoint, { input, webhookUrl: this.webhookUrl });
    return { requestId: result.request_id };
  }
}
