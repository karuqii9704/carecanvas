import { NextResponse } from "next/server";

import { createJobSchema } from "@/domain/job";
import { inngest } from "@/inngest/client";
import { getRequestActor } from "@/server/auth/actor";
import { getServerEnv, isLiveConfigured } from "@/server/env";
import { createDraft, JobPipeline } from "@/server/pipeline/job-pipeline";
import { getPipelineProviders } from "@/server/providers";
import { getRateLimiter, getUsageBudget, LimitExceededError } from "@/server/security/limits";
import { getJobRepository } from "@/server/store/job-repository";

export async function POST(request: Request) {
  try {
    const actor = await getRequestActor(request);
    if (!actor) return NextResponse.json({ error: "Authentication required in live mode." }, { status: 401 });
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    getRateLimiter().check(forwarded || actor.id);
    const input = createJobSchema.parse(await request.json());
    const env = getServerEnv();
    if (isLiveConfigured(env)) getUsageBudget(env.CARECANVAS_DAILY_LIMIT, env.CARECANVAS_LIFETIME_LIMIT).reserve(actor.id);

    const repository = getJobRepository();
    const draft = await repository.create(createDraft(actor.id, input));
    if (isLiveConfigured(env)) {
      await inngest.send({ name: "carecanvas/job.requested", data: { jobId: draft.id, ownerId: actor.id } });
      return NextResponse.json({ job: draft, execution: "durable" }, { status: 202 });
    }
    const job = await new JobPipeline(repository, getPipelineProviders()).prepare(draft);
    return NextResponse.json({ job, execution: "deterministic-demo" }, { status: 201 });
  } catch (error) {
    if (error instanceof LimitExceededError) return NextResponse.json({ error: error.message }, { status: 429 });
    const message = error instanceof Error ? error.message : "Unable to create the illustration job.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
