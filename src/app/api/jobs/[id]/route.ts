import { NextResponse } from "next/server";

import { getRequestActor } from "@/server/auth/actor";
import { getJobRepository } from "@/server/store/job-repository";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await getRequestActor(request);
  if (!actor) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await context.params;
  const job = await getJobRepository().get(id, actor.id);
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });
  return NextResponse.json({ job });
}
