import "server-only";

import type { ApprovalInput, CareJob, CreateJobInput, JobStatus, TraceState, TraceStep } from "@/domain/job";
import { assertTransition, redactProviderId } from "@/domain/job";
import type { PipelineProviders } from "@/server/providers/contracts";
import type { JobRepository } from "@/server/store/job-repository";

const MAX_GENERATION_ATTEMPTS = 2;

function nowIso(): string {
  return new Date().toISOString();
}

function trace(
  name: string,
  agent: string,
  state: TraceState,
  detail: string,
  attempt = 1,
  durationMs?: number,
  providerRequestId?: string,
): TraceStep {
  const completed = !["queued", "running", "waiting"].includes(state);
  const at = nowIso();
  return {
    id: crypto.randomUUID(),
    name,
    agent,
    state,
    startedAt: at,
    completedAt: completed ? at : undefined,
    durationMs,
    attempt,
    detail,
    providerRequestId: redactProviderId(providerRequestId),
  };
}

function transition(job: CareJob, status: JobStatus): CareJob {
  assertTransition(job.status, status);
  return { ...job, status, updatedAt: nowIso() };
}

function replaceWaitingApproval(traceSteps: TraceStep[], state: "passed" | "failed", detail: string): TraceStep[] {
  const completedAt = nowIso();
  return traceSteps.map((step) =>
    step.agent === "content lead" && step.state === "waiting"
      ? { ...step, state, detail, completedAt, durationMs: Math.max(1, Date.parse(completedAt) - Date.parse(step.startedAt)) }
      : step,
  );
}

export function createDraft(ownerId: string, input: CreateJobInput): CareJob {
  const timestamp = nowIso();
  return {
    ...input,
    id: crypto.randomUUID(),
    ownerId,
    status: "draft",
    attempts: 0,
    trace: [trace("Input accepted", "policy-gateway", "passed", "Schema valid · source normalized", 1, 12)],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export class JobPipeline {
  constructor(
    private readonly repository: JobRepository,
    private readonly providers: PipelineProviders,
  ) {}

  async prepare(job: CareJob): Promise<CareJob> {
    let current = transition(job, "reviewing");
    try {
      const briefStarted = performance.now();
      const brief = await this.providers.intelligence.createBrief(current);
      const briefDuration = Math.max(1, Math.round(performance.now() - briefStarted));
      current = {
        ...current,
        sceneBrief: brief,
        trace: [...current.trace, trace("Scene brief", "brief-agent", "passed", "Intent structured into preserve / avoid constraints", 1, briefDuration)],
      };
      const safetyStarted = performance.now();
      const safety = await this.providers.intelligence.reviewSafety(current, brief);
      const safetyDuration = Math.max(1, Math.round(performance.now() - safetyStarted));
      current = {
        ...current,
        safetyReview: safety,
        trace: [
          ...current.trace,
          trace(
            "Safety review",
            "safety-agent",
            safety.verdict === "pass" ? "passed" : "warning",
            safety.reasons.join(" · "),
            1,
            safetyDuration,
          ),
        ],
      };
      if (safety.verdict !== "pass") {
        current = transition(current, "blocked");
        current.trace.push(trace("Policy decision", "policy-gateway", "failed", "Generation stopped before provider spend."));
      } else {
        current = transition(current, "awaiting_approval");
        current.trace.push(trace("Human approval", "content lead", "waiting", "Review the refined brief before provider spend."));
      }
    } catch (error) {
      current = transition(current, "failed");
      current.trace.push(
        trace("Pipeline preparation", "orchestrator", "failed", error instanceof Error ? error.message : "Unexpected preparation failure"),
      );
    }
    return this.repository.save(current);
  }

  async applyApproval(job: CareJob, approval: ApprovalInput): Promise<CareJob> {
    if (job.status !== "awaiting_approval") throw new Error("This job is not waiting for approval.");
    if (approval.decision === "rejected") {
      const blocked = transition(job, "blocked");
      blocked.trace = replaceWaitingApproval(blocked.trace, "failed", approval.note || "Rejected by content lead.");
      return this.repository.save(blocked);
    }
    const approved = transition(job, "generating");
    approved.trace = replaceWaitingApproval(approved.trace, "passed", approval.note || "Approved before provider spend.");
    return this.repository.save(approved);
  }

  async submit(job: CareJob): Promise<CareJob> {
    if (job.status !== "generating" || !job.sceneBrief) throw new Error("Job is not ready for generation.");
    const attempt = job.attempts + 1;
    if (attempt > MAX_GENERATION_ATTEMPTS) throw new Error("Generation retry boundary reached.");
    try {
      const imageStarted = performance.now();
      const submission = await this.providers.image.submit(job, job.sceneBrief, attempt);
      const imageDuration = Math.max(1, Math.round(performance.now() - imageStarted));
      const updated: CareJob = {
        ...job,
        providerRequestId: submission.requestId,
        outputUrl: submission.immediateOutputUrl,
        attempts: attempt,
        updatedAt: nowIso(),
        trace: [
          ...job.trace,
          trace(
            "Image edit",
            job.mode === "inpaint" ? "image-provider · inpaint" : "image-provider · img2img",
            submission.immediateOutputUrl ? "passed" : "running",
            submission.immediateOutputUrl ? "Deterministic demo output ready" : "Async provider job submitted",
            attempt,
            imageDuration,
            submission.requestId,
          ),
        ],
      };
      return this.repository.save(updated);
    } catch (error) {
      const failed = transition(job, "failed");
      failed.trace.push(
        trace("Image edit", "image-provider", "failed", error instanceof Error ? error.message : "Provider submission failed", attempt),
      );
      return this.repository.save(failed);
    }
  }

  async review(job: CareJob, outputUrl: string): Promise<CareJob> {
    if (job.status !== "generating") throw new Error("Job is not waiting for a generated image.");
    let current = transition({ ...job, outputUrl }, "qa_review");
    try {
      const reviewStarted = performance.now();
      const qa = await this.providers.intelligence.reviewImage(current, outputUrl, current.attempts);
      const reviewDuration = Math.max(1, Math.round(performance.now() - reviewStarted));
      current = {
        ...current,
        qaReview: qa,
        trace: [
          ...current.trace,
          trace(
            "Visual QA",
            "visual-qa-agent",
            qa.verdict === "pass" ? "passed" : "warning",
            `Score ${qa.score}/100 · ${qa.verdict === "retry" ? "bounded correction requested" : "quality gate evaluated"}`,
            current.attempts,
            reviewDuration,
          ),
        ],
      };
      if (qa.verdict === "pass") current = transition(current, "completed");
      else if (qa.verdict === "retry" && current.attempts < MAX_GENERATION_ATTEMPTS) current = transition(current, "generating");
      else current = transition(current, "needs_human_review");
    } catch (error) {
      current = transition(current, "failed");
      current.trace.push(
        trace("Visual QA", "visual-qa-agent", "failed", error instanceof Error ? error.message : "QA agent failed", current.attempts),
      );
    }
    return this.repository.save(current);
  }

  async runDemoAfterApproval(job: CareJob, approval: ApprovalInput): Promise<CareJob> {
    let current = await this.applyApproval(job, approval);
    if (current.status !== "generating") return current;
    current = await this.submit(current);
    while (current.status === "generating" && current.outputUrl) {
      current = await this.review(current, current.outputUrl);
      if (current.status === "generating") current = await this.submit(current);
    }
    return current;
  }
}
