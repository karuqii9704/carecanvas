import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import {
  qaReviewSchema,
  safetyReviewSchema,
  sceneBriefSchema,
  type CareJob,
  type QaReview,
  type SafetyReview,
  type SceneBrief,
} from "@/domain/job";
import type { IntelligenceProvider } from "@/server/providers/contracts";

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  return JSON.parse((fenced ?? text).trim());
}

export class AnthropicIntelligenceProvider implements IntelligenceProvider {
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    this.client = new Anthropic({ apiKey });
  }

  private async structured<T>(instruction: string, schema: z.ZodType<T>): Promise<T> {
    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: 900,
      temperature: 0,
      system:
        "You are one bounded agent in a human-gated illustration pipeline. Return JSON only. Never diagnose, prescribe, or infer sensitive information.",
      messages: [{ role: "user", content: instruction }],
    });
    const text = message.content.find((block) => block.type === "text");
    if (!text || text.type !== "text") throw new Error("Claude returned no structured text output.");
    return schema.parse(extractJson(text.text));
  }

  createBrief(job: CareJob): Promise<SceneBrief> {
    return this.structured(
      `Create a scene brief for this request. Return keys refinedPrompt, visualIntent, preserve[], avoid[], agent="brief-agent". Audience: ${job.audience}. Mode: ${job.mode}. Request: ${job.prompt}`,
      sceneBriefSchema,
    );
  }

  reviewSafety(job: CareJob, brief: SceneBrief): Promise<SafetyReview> {
    return this.structured(
      `Review this creative request for child safety and unsupported medical claims. Return verdict (pass|block|human_review), reasons[], childSafe, medicalClaimFree, agent="safety-agent". Original: ${job.prompt}. Refined: ${brief.refinedPrompt}`,
      safetyReviewSchema,
    );
  }

  reviewImage(job: CareJob, outputUrl: string, attempt: number): Promise<QaReview> {
    return this.client.messages
      .create({
        model: this.model,
        max_tokens: 900,
        temperature: 0,
        system:
          "You are the bounded visual-QA agent in a human-gated illustration pipeline. Return JSON only. Never diagnose or infer sensitive traits.",
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "url", url: outputUrl } },
              {
                type: "text",
                text: `Evaluate this generated image against the approved brief. Return verdict (pass|retry|human_review), score 0-100, checks[{label,passed,note}], optional correction, agent="visual-qa-agent". Attempt: ${attempt}. Brief: ${job.sceneBrief?.refinedPrompt}`,
              },
            ],
          },
        ],
      })
      .then((message) => {
        const text = message.content.find((block) => block.type === "text");
        if (!text || text.type !== "text") throw new Error("Claude Vision returned no structured text output.");
        return qaReviewSchema.parse(extractJson(text.text));
      });
  }
}
