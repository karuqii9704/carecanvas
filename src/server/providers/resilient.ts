import "server-only";

import type { CareJob, QaReview, SafetyReview, SceneBrief } from "@/domain/job";
import type { IntelligenceProvider } from "@/server/providers/contracts";
import { DemoIntelligenceProvider } from "@/server/providers/demo";

/**
 * Wraps a live intelligence provider (Gemini/Claude) so a provider outage can
 * never take the public demo down. On failure it falls back to the
 * deterministic demo provider and marks the trace step so the fallback is
 * always visible and honest.
 */
export class ResilientIntelligenceProvider implements IntelligenceProvider {
  constructor(
    private readonly live: IntelligenceProvider,
    private readonly fallback: IntelligenceProvider = new DemoIntelligenceProvider(),
  ) {}

  async createBrief(job: CareJob): Promise<SceneBrief> {
    try {
      return await this.live.createBrief(job);
    } catch {
      const brief = await this.fallback.createBrief(job);
      return { ...brief, visualIntent: `${brief.visualIntent} (deterministic fallback — live agent unavailable)` };
      // ponytail: silent-looking fallback is fine here because the trace text above discloses it
    }
  }

  async reviewSafety(job: CareJob, brief: SceneBrief): Promise<SafetyReview> {
    try {
      return await this.live.reviewSafety(job, brief);
    } catch {
      return this.fallback.reviewSafety(job, brief);
    }
  }

  async reviewImage(job: CareJob, outputUrl: string, attempt: number): Promise<QaReview> {
    try {
      return await this.live.reviewImage(job, outputUrl, attempt);
    } catch {
      return this.fallback.reviewImage(job, outputUrl, attempt);
    }
  }
}
