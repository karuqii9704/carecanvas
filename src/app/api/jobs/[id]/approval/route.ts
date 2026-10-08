import { NextResponse } from "next/server";
import { z } from "zod";

import { approvalSchema } from "@/domain/job";
import { inngest } from "@/inngest/client";
import { getRequestActor } from "@/server/auth/actor";
import { getExecutionProfile, getServerEnv } from "@/server/env";
import { JobPipeline } from "@/server/pipeline/job-pipeline";
import { getPipelineProviders } from "@/server/providers";
import { MAX_JOB_TOKEN_LENGTH, verifyJobToken } from "@/server/security/job-token";
import { getApprovalRateLimiter, LimitExceededError } from "@/server/security/limits";
import { getJobRepository } from "@/server/store/job-repository";

export const maxDuration = 60;

const jobTokenSchema = z.object({ jobToken: z.string().max(MAX_JOB_TOKEN_LENGTH).optional() });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getRequestActor(request);
    if (!actor) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || actor.id;
    getApprovalRateLimiter().check(forwarded);
    const { id } = await context.params;
    const body: unknown = await request.json();
    const approval = approvalSchema.parse(body);
    const env = getServerEnv();
    const profile = getExecutionProfile(env);
    const repository = getJobRepository();
    let job = await repository.get(id, actor.id);
    if (!job && profile !== "live") {
      // Another serverless instance created this job; resume from the signed snapshot.
      const { jobToken } = jobTokenSchema.parse(body);
      job = jobToken ? verifyJobToken(env, jobToken, { id, ownerId: actor.id }) : null;
    }
    if (!job) return NextResponse.json({ error: "Job not found. Run the review agents again." }, { status: 404 });

    if (profile === "live") {
      await inngest.send({
        name: "carecanvas/approval.responded",
        data: { jobId: id, ...approval },
      });
      return NextResponse.json({ job, execution: "approval-event-sent" }, { status: 202 });
    }
    const updated = await new JobPipeline(repository, getPipelineProviders()).runDemoAfterApproval(job, approval);
    return NextResponse.json({
      job: updated,
      execution: profile === "harness" ? `${env.CARECANVAS_INTELLIGENCE_PROVIDER}-harness` : "deterministic-demo",
    });
  } catch (error) {
    if (error instanceof LimitExceededError) return NextResponse.json({ error: error.message }, { status: 429 });
    const message = error instanceof Error ? error.message : "Unable to apply approval.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
