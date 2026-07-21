import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { seedJob } from "@/domain/demo-data";
import { careJobSchema, type CareJob } from "@/domain/job";
import { getExecutionProfile, getServerEnv } from "@/server/env";

export interface JobRepository {
  create(job: CareJob): Promise<CareJob>;
  get(id: string, ownerId: string): Promise<CareJob | null>;
  findByProviderRequestId(requestId: string): Promise<CareJob | null>;
  save(job: CareJob): Promise<CareJob>;
}

type GlobalStore = typeof globalThis & { __carecanvasJobs?: Map<string, CareJob> };

export class MemoryJobRepository implements JobRepository {
  private readonly jobs: Map<string, CareJob>;

  constructor(initial: CareJob[] = [seedJob]) {
    const root = globalThis as GlobalStore;
    root.__carecanvasJobs ??= new Map(initial.map((job) => [job.id, structuredClone(job)]));
    this.jobs = root.__carecanvasJobs;
  }

  async create(job: CareJob): Promise<CareJob> {
    if (this.jobs.has(job.id)) throw new Error("Job already exists.");
    this.jobs.set(job.id, structuredClone(job));
    return structuredClone(job);
  }

  async get(id: string, ownerId: string): Promise<CareJob | null> {
    const job = this.jobs.get(id);
    return job?.ownerId === ownerId ? structuredClone(job) : null;
  }

  async findByProviderRequestId(requestId: string): Promise<CareJob | null> {
    const job = [...this.jobs.values()].find((candidate) => candidate.providerRequestId === requestId);
    return job ? structuredClone(job) : null;
  }

  async save(job: CareJob): Promise<CareJob> {
    careJobSchema.parse(job);
    this.jobs.set(job.id, structuredClone(job));
    return structuredClone(job);
  }
}

type JobRow = {
  id: string;
  owner_id: string;
  title: string;
  prompt: string;
  audience: CareJob["audience"];
  mode: CareJob["mode"];
  input_url: string;
  mask_url: string | null;
  status: CareJob["status"];
  scene_brief: CareJob["sceneBrief"] | null;
  safety_review: CareJob["safetyReview"] | null;
  qa_review: CareJob["qaReview"] | null;
  output_url: string | null;
  provider_request_id: string | null;
  attempts: number;
  simulate_first_qa_failure: boolean;
  trace: CareJob["trace"];
  created_at: string;
  updated_at: string;
};

function toRow(job: CareJob): JobRow {
  return {
    id: job.id,
    owner_id: job.ownerId,
    title: job.title,
    prompt: job.prompt,
    audience: job.audience,
    mode: job.mode,
    input_url: job.inputUrl,
    mask_url: job.maskUrl ?? null,
    status: job.status,
    scene_brief: job.sceneBrief ?? null,
    safety_review: job.safetyReview ?? null,
    qa_review: job.qaReview ?? null,
    output_url: job.outputUrl ?? null,
    provider_request_id: job.providerRequestId ?? null,
    attempts: job.attempts,
    simulate_first_qa_failure: job.simulateFirstQaFailure,
    trace: job.trace,
    created_at: job.createdAt,
    updated_at: job.updatedAt,
  };
}

function fromRow(row: JobRow): CareJob {
  return careJobSchema.parse({
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    prompt: row.prompt,
    audience: row.audience,
    mode: row.mode,
    inputUrl: row.input_url,
    maskUrl: row.mask_url ?? undefined,
    status: row.status,
    sceneBrief: row.scene_brief ?? undefined,
    safetyReview: row.safety_review ?? undefined,
    qaReview: row.qa_review ?? undefined,
    outputUrl: row.output_url ?? undefined,
    providerRequestId: row.provider_request_id ?? undefined,
    attempts: row.attempts,
    simulateFirstQaFailure: row.simulate_first_qa_failure,
    trace: row.trace,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export class SupabaseJobRepository implements JobRepository {
  constructor(private readonly client: SupabaseClient) {}

  async create(job: CareJob): Promise<CareJob> {
    const { data, error } = await this.client.from("jobs").insert(toRow(job)).select().single();
    if (error) throw error;
    return fromRow(data as JobRow);
  }

  async get(id: string, ownerId: string): Promise<CareJob | null> {
    const { data, error } = await this.client.from("jobs").select("*").eq("id", id).eq("owner_id", ownerId).maybeSingle();
    if (error) throw error;
    return data ? fromRow(data as JobRow) : null;
  }

  async findByProviderRequestId(requestId: string): Promise<CareJob | null> {
    const { data, error } = await this.client
      .from("jobs")
      .select("*")
      .eq("provider_request_id", requestId)
      .maybeSingle();
    if (error) throw error;
    return data ? fromRow(data as JobRow) : null;
  }

  async save(job: CareJob): Promise<CareJob> {
    const { data, error } = await this.client.from("jobs").upsert(toRow(job)).select().single();
    if (error) throw error;
    return fromRow(data as JobRow);
  }
}

let memoryRepository: MemoryJobRepository | undefined;

export function getJobRepository(): JobRepository {
  const env = getServerEnv();
  if (getExecutionProfile(env) !== "live") {
    memoryRepository ??= new MemoryJobRepository();
    return memoryRepository;
  }
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return new SupabaseJobRepository(client);
}
