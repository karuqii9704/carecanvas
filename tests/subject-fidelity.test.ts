import { beforeEach, describe, expect, it } from "vitest";

import { createJobSchema, type CareJob } from "@/domain/job";
import { parseSceneSlug } from "@/domain/scene";
import { describeImageStage } from "@/features/jobs/image-stage";
import { createDraft, JobPipeline } from "@/server/pipeline/job-pipeline";
import { DemoImageProvider, DemoIntelligenceProvider } from "@/server/providers/demo";
import type { JobRepository } from "@/server/store/job-repository";

class TestRepository implements JobRepository {
  jobs = new Map<string, CareJob>();
  async create(job: CareJob) { this.jobs.set(job.id, structuredClone(job)); return job; }
  async get(id: string, ownerId: string) { const job = this.jobs.get(id); return job?.ownerId === ownerId ? structuredClone(job) : null; }
  async findByProviderRequestId(requestId: string) { return [...this.jobs.values()].find((job) => job.providerRequestId === requestId) ?? null; }
  async save(job: CareJob) { this.jobs.set(job.id, structuredClone(job)); return structuredClone(job); }
}

const catInput = createJobSchema.parse({
  title: "Name the feeling",
  prompt: "Turn the central character into a calm, friendly cat holding an emotion card. Preserve the quiet reading nook and leave generous space for facilitator copy.",
  audience: "children-6-9",
  mode: "img2img",
  inputUrl: "/assets/carecanvas-source.svg",
  simulateFirstQaFailure: false,
});

/**
 * Asking the demo for a cat must draw a cat, and before approval the panel
 * falls back to the character-free source. The image stage has to say which
 * one you are looking at rather than leaving a reader to guess.
 */
describe("demo image-stage honesty", () => {
  let repository: TestRepository;
  let pipeline: JobPipeline;

  beforeEach(() => {
    repository = new TestRepository();
    pipeline = new JobPipeline(repository, {
      intelligence: new DemoIntelligenceProvider(),
      image: new DemoImageProvider(),
    });
  });

  it("has no output at the approval gate, so the panel falls back to source art", async () => {
    const prepared = await pipeline.prepare(await repository.create(createDraft("owner-1", catInput)));
    expect(prepared.status).toBe("awaiting_approval");
    expect(prepared.outputUrl).toBeUndefined();

    const stage = describeImageStage("harness", Boolean(prepared.outputUrl));
    expect(stage.label).toContain("NOT GENERATED YET");
    expect(stage.note).toMatch(/not a result/i);
  });

  it("draws the requested subject instead of fixed artwork", async () => {
    const prepared = await pipeline.prepare(await repository.create(createDraft("owner-1", catInput)));
    const completed = await pipeline.runDemoAfterApproval(prepared, { decision: "approved", note: "Checked." });

    expect(completed.status).toBe("completed");
    expect(parseSceneSlug(completed.outputUrl!)).toMatchObject({ subject: "cat", object: "emotion-card", setting: "reading-nook" });
    expect(completed.qaReview?.checks[0]?.note).toMatch(/cat/);
  });

  it("labels local output as a render, not a model generation, outside live mode", async () => {
    for (const profile of ["demo", "harness"] as const) {
      const stage = describeImageStage(profile, true);
      expect(stage.label).toBe("LOCAL RENDER");
      expect(stage.note).toMatch(/no paid image model/i);
    }
  });

  it("keeps the release-candidate claim only for live mode", () => {
    const stage = describeImageStage("live", true);
    expect(stage.label).toBe("RELEASE CANDIDATE");
    expect(stage.note).toBeNull();
  });
});
