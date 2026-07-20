import { z } from "zod";

export const editModes = ["img2img", "inpaint"] as const;
export type EditMode = (typeof editModes)[number];

export const jobStatuses = [
  "draft",
  "reviewing",
  "blocked",
  "awaiting_approval",
  "generating",
  "qa_review",
  "completed",
  "needs_human_review",
  "failed",
  "expired",
] as const;
export type JobStatus = (typeof jobStatuses)[number];

export const traceStates = ["queued", "running", "passed", "warning", "failed", "waiting"] as const;
export type TraceState = (typeof traceStates)[number];

const publicAssetOrUrl = z.string().refine(
  (value) => value.startsWith("/assets/") || z.url().safeParse(value).success,
  "Use an HTTPS URL or a bundled /assets/ path.",
);

export const createJobSchema = z
  .object({
    title: z.string().trim().min(3).max(80),
    prompt: z.string().trim().min(20).max(1_200),
    audience: z.enum(["children-6-9", "children-10-13", "families", "wellbeing-teams"]),
    mode: z.enum(editModes),
    inputUrl: publicAssetOrUrl,
    maskUrl: publicAssetOrUrl.optional(),
    simulateFirstQaFailure: z.boolean().default(false),
  })
  .superRefine((value, context) => {
    if (value.mode === "inpaint" && !value.maskUrl) {
      context.addIssue({
        code: "custom",
        path: ["maskUrl"],
        message: "A mask is required for inpainting.",
      });
    }
  });

export type CreateJobInput = z.infer<typeof createJobSchema>;

export const approvalSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(280).default(""),
});
export type ApprovalInput = z.infer<typeof approvalSchema>;

export const sceneBriefSchema = z.object({
  refinedPrompt: z.string().min(20),
  visualIntent: z.string().min(10),
  preserve: z.array(z.string()).min(1).max(6),
  avoid: z.array(z.string()).min(1).max(8),
  agent: z.literal("brief-agent"),
});
export type SceneBrief = z.infer<typeof sceneBriefSchema>;

export const safetyReviewSchema = z.object({
  verdict: z.enum(["pass", "block", "human_review"]),
  reasons: z.array(z.string()).max(6),
  childSafe: z.boolean(),
  medicalClaimFree: z.boolean(),
  agent: z.literal("safety-agent"),
});
export type SafetyReview = z.infer<typeof safetyReviewSchema>;

export const qaReviewSchema = z.object({
  verdict: z.enum(["pass", "retry", "human_review"]),
  score: z.number().min(0).max(100),
  checks: z.array(
    z.object({
      label: z.string(),
      passed: z.boolean(),
      note: z.string(),
    }),
  ),
  correction: z.string().optional(),
  agent: z.literal("visual-qa-agent"),
});
export type QaReview = z.infer<typeof qaReviewSchema>;

export const traceStepSchema = z.object({
  id: z.string(),
  name: z.string(),
  agent: z.string(),
  state: z.enum(traceStates),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  durationMs: z.number().nonnegative().optional(),
  attempt: z.number().int().positive(),
  detail: z.string(),
  providerRequestId: z.string().optional(),
});
export type TraceStep = z.infer<typeof traceStepSchema>;

export const careJobSchema = createJobSchema.extend({
  id: z.string().uuid(),
  ownerId: z.string(),
  status: z.enum(jobStatuses),
  sceneBrief: sceneBriefSchema.optional(),
  safetyReview: safetyReviewSchema.optional(),
  qaReview: qaReviewSchema.optional(),
  outputUrl: publicAssetOrUrl.optional(),
  providerRequestId: z.string().optional(),
  attempts: z.number().int().nonnegative(),
  trace: z.array(traceStepSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CareJob = z.infer<typeof careJobSchema>;

export const falWebhookSchema = z.object({
  request_id: z.string().min(1),
  status: z.enum(["OK", "ERROR"]),
  payload: z.unknown().optional(),
  error: z.string().optional(),
});

const terminalStatuses: ReadonlySet<JobStatus> = new Set([
  "blocked",
  "completed",
  "needs_human_review",
  "failed",
  "expired",
]);

export function isTerminalStatus(status: JobStatus): boolean {
  return terminalStatuses.has(status);
}

const allowedTransitions: Record<JobStatus, readonly JobStatus[]> = {
  draft: ["reviewing", "failed"],
  reviewing: ["blocked", "awaiting_approval", "failed"],
  blocked: [],
  awaiting_approval: ["generating", "blocked", "expired", "failed"],
  generating: ["qa_review", "failed"],
  qa_review: ["generating", "completed", "needs_human_review", "failed"],
  completed: [],
  needs_human_review: [],
  failed: [],
  expired: [],
};

export function assertTransition(from: JobStatus, to: JobStatus): void {
  if (!allowedTransitions[from].includes(to)) {
    throw new Error(`Invalid CareCanvas transition: ${from} -> ${to}`);
  }
}

export function redactProviderId(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (value.length < 9) return "••••";
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}
