import { beforeEach, describe, expect, it } from "vitest";

import { createJobSchema, type CareJob } from "@/domain/job";
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

const baseInput = createJobSchema.parse({
  title: "Calm activity card",
  prompt: "Replace the central figure with a friendly turtle and retain the quiet reading nook.",
  audience: "children-6-9",
  mode: "img2img",
  inputUrl: "/assets/carecanvas-source.svg",
  simulateFirstQaFailure: false,
});

describe("JobPipeline", () => {
  let repository: TestRepository;
  let pipeline: JobPipeline;

  beforeEach(() => {
    repository = new TestRepository();
    pipeline = new JobPipeline(repository, {
      intelligence: new DemoIntelligenceProvider(),
      image: new DemoImageProvider(),
    });
  });

  it("stops at the human approval gate", async () => {
    const draft = await repository.create(createDraft("owner-1", baseInput));
    const prepared = await pipeline.prepare(draft);
    expect(prepared.status).toBe("awaiting_approval");
    expect(prepared.attempts).toBe(0);
    expect(prepared.trace.at(-1)?.state).toBe("waiting");
  });

  it("rejects unsafe direction before provider spend", async () => {
    const unsafe = { ...baseInput, prompt: "Create a patient record and diagnose this child with a condition." };
    const prepared = await pipeline.prepare(await repository.create(createDraft("owner-1", unsafe)));
    expect(prepared.status).toBe("blocked");
    expect(prepared.attempts).toBe(0);
    expect(prepared.safetyReview?.verdict).toBe("block");
  });

  it("records a human rejection without generating", async () => {
    const prepared = await pipeline.prepare(await repository.create(createDraft("owner-1", baseInput)));
    const rejected = await pipeline.runDemoAfterApproval(prepared, { decision: "rejected", note: "Needs revision." });
    expect(rejected.status).toBe("blocked");
    expect(rejected.attempts).toBe(0);
  });

  it("completes the deterministic happy path after approval", async () => {
    const prepared = await pipeline.prepare(await repository.create(createDraft("owner-1", baseInput)));
    const completed = await pipeline.runDemoAfterApproval(prepared, { decision: "approved", note: "Checked." });
    expect(completed.status).toBe("completed");
    expect(completed.attempts).toBe(1);
    expect(completed.qaReview?.score).toBe(94);
  });

  it("performs one corrective retry and then stops", async () => {
    const input = { ...baseInput, simulateFirstQaFailure: true };
    const prepared = await pipeline.prepare(await repository.create(createDraft("owner-1", input)));
    const completed = await pipeline.runDemoAfterApproval(prepared, { decision: "approved", note: "Checked." });
    expect(completed.status).toBe("completed");
    expect(completed.attempts).toBe(2);
    expect(completed.trace.filter((step) => step.name === "Image edit")).toHaveLength(2);
    expect(completed.trace.some((step) => step.state === "warning")).toBe(true);
  });
});
