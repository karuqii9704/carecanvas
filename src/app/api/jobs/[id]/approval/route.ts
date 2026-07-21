import { NextResponse } from "next/server";

import { approvalSchema } from "@/domain/job";
import { inngest } from "@/inngest/client";
import { getRequestActor } from "@/server/auth/actor";
import { getExecutionProfile, getServerEnv } from "@/server/env";
import { JobPipeline } from "@/server/pipeline/job-pipeline";
import { getPipelineProviders } from "@/server/providers";
import { getJobRepository } from "@/server/store/job-repository";

export const maxDuration = 60;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getRequestActor(request);
    if (!actor) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const { id } = await context.params;
    const approval = approvalSchema.parse(await request.json());
    const repository = getJobRepository();
    const job = await repository.get(id, actor.id);
    if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });

    const env = getServerEnv();
    const profile = getExecutionProfile(env);
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
    const message = error instanceof Error ? error.message : "Unable to apply approval.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
