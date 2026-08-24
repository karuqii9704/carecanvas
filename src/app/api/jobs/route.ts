import { NextResponse } from "next/server";

import { createJobSchema } from "@/domain/job";
import { inngest } from "@/inngest/client";
import { getRequestActor } from "@/server/auth/actor";
import { getExecutionProfile, getServerEnv } from "@/server/env";
import { createDraft, JobPipeline } from "@/server/pipeline/job-pipeline";
import { getPipelineProviders } from "@/server/providers";
import { getRateLimiter, getUsageBudget, LimitExceededError } from "@/server/security/limits";
import { getJobRepository } from "@/server/store/job-repository";

export const maxDuration = 60;

function trialsRemaining(ownerKey: string): number {
  const env = getServerEnv();
  const budget = getUsageBudget(env.CARECANVAS_DAILY_LIMIT, env.CARECANVAS_LIFETIME_LIMIT);
  return Math.max(0, env.CARECANVAS_DAILY_LIMIT - budget.usedToday(ownerKey));
}

export async function POST(request: Request) {
  try {
    const actor = await getRequestActor(request);
    if (!actor) return NextResponse.json({ error: "Authentication required in live mode." }, { status: 401 });
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || actor.id;
    getRateLimiter().check(forwarded);
    const input = createJobSchema.parse(await request.json());
    const env = getServerEnv();
    const profile = getExecutionProfile(env);
    // ponytail: non-live actors share DEMO_OWNER_ID, so budget by client IP instead
    if (profile !== "demo") getUsageBudget(env.CARECANVAS_DAILY_LIMIT, env.CARECANVAS_LIFETIME_LIMIT).reserve(profile === "live" ? actor.id : forwarded);

    const repository = getJobRepository();
    const draft = await repository.create(createDraft(actor.id, input));
    if (profile === "live") {
      await inngest.send({ name: "carecanvas/job.requested", data: { jobId: draft.id, ownerId: actor.id } });
      return NextResponse.json({ job: draft, execution: "durable", trialsRemaining: trialsRemaining(forwarded) }, { status: 202 });
    }
    const job = await new JobPipeline(repository, getPipelineProviders()).prepare(draft);
    return NextResponse.json(
      {
        job,
        execution: profile === "harness" ? `${env.CARECANVAS_INTELLIGENCE_PROVIDER}-harness` : "deterministic-demo",
        trialsRemaining: trialsRemaining(forwarded),
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof LimitExceededError) {
      return NextResponse.json({ error: error.message, trialsRemaining: 0 }, { status: 429 });
    }
    const message = error instanceof Error ? error.message : "Unable to create the illustration job.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
