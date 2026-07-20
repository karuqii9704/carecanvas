import { approvalSchema } from "@/domain/job";
import { inngest } from "@/inngest/client";
import { JobPipeline } from "@/server/pipeline/job-pipeline";
import { getPipelineProviders } from "@/server/providers";
import { getJobRepository } from "@/server/store/job-repository";

export const orchestrateIllustration = inngest.createFunction(
  {
    id: "orchestrate-illustration",
    retries: 2,
    triggers: { event: "carecanvas/job.requested" },
  },
  async ({ event, step }) => {
    const { jobId, ownerId } = event.data as { jobId: string; ownerId: string };
    const prepared = await step.run("prepare-agents", async () => {
      const repository = getJobRepository();
      const job = await repository.get(jobId, ownerId);
      if (!job) throw new Error("Job not found.");
      return new JobPipeline(repository, getPipelineProviders()).prepare(job);
    });
    if (prepared.status !== "awaiting_approval") return { jobId, status: prepared.status };

    const approvalEvent = await step.waitForEvent("wait-for-human-approval", {
      event: "carecanvas/approval.responded",
      timeout: "24h",
      if: "async.data.jobId == event.data.jobId",
    });
    if (!approvalEvent) {
      await step.run("expire-unapproved-job", async () => {
        const repository = getJobRepository();
        const job = await repository.get(jobId, ownerId);
        if (job?.status === "awaiting_approval") {
          await repository.save({ ...job, status: "expired", updatedAt: new Date().toISOString() });
        }
      });
      return { jobId, status: "expired" };
    }

    const approved = await step.run("apply-human-decision", async () => {
      const repository = getJobRepository();
      const job = await repository.get(jobId, ownerId);
      if (!job) throw new Error("Job not found after approval.");
      const decision = approvalSchema.parse(approvalEvent.data);
      return new JobPipeline(repository, getPipelineProviders()).applyApproval(job, decision);
    });
    if (approved.status !== "generating") return { jobId, status: approved.status };

    const submitted = await step.run("submit-image-generation", async () => {
      const repository = getJobRepository();
      return new JobPipeline(repository, getPipelineProviders()).submit(approved);
    });
    return { jobId, status: submitted.status, providerRequestId: submitted.providerRequestId };
  },
);

export const reviewGeneratedIllustration = inngest.createFunction(
  {
    id: "review-generated-illustration",
    retries: 2,
    triggers: { event: "carecanvas/fal.completed" },
  },
  async ({ event, step }) => {
    const { providerRequestId, outputUrl } = event.data as { providerRequestId: string; outputUrl: string };
    const reviewed = await step.run("visual-qa", async () => {
      const repository = getJobRepository();
      const job = await repository.findByProviderRequestId(providerRequestId);
      if (!job) throw new Error("No CareCanvas job matches this provider request.");
      return new JobPipeline(repository, getPipelineProviders()).review(job, outputUrl);
    });
    if (reviewed.status !== "generating") return { jobId: reviewed.id, status: reviewed.status };

    const retry = await step.run("bounded-corrective-retry", async () => {
      const repository = getJobRepository();
      return new JobPipeline(repository, getPipelineProviders()).submit(reviewed);
    });
    return { jobId: retry.id, status: retry.status, providerRequestId: retry.providerRequestId };
  },
);

export const recordGenerationFailure = inngest.createFunction(
  {
    id: "record-generation-failure",
    retries: 1,
    triggers: { event: "carecanvas/fal.failed" },
  },
  async ({ event, step }) => {
    const { providerRequestId, error } = event.data as { providerRequestId: string; error: string };
    return step.run("classify-provider-failure", async () => {
      const repository = getJobRepository();
      const job = await repository.findByProviderRequestId(providerRequestId);
      if (!job || job.status !== "generating") return { status: "ignored" };
      const failed = await repository.save({
        ...job,
        status: "failed",
        updatedAt: new Date().toISOString(),
        trace: [
          ...job.trace,
          {
            id: crypto.randomUUID(),
            name: "Provider callback",
            agent: "fal.ai · error boundary",
            state: "failed",
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            attempt: Math.max(1, job.attempts),
            detail: error.slice(0, 240),
          },
        ],
      });
      return { jobId: failed.id, status: failed.status };
    });
  },
);

export const careCanvasFunctions = [orchestrateIllustration, reviewGeneratedIllustration, recordGenerationFailure];
