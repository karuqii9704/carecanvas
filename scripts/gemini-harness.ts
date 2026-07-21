import { careJobSchema, type CareJob } from "@/domain/job";
import {
  GeminiIntelligenceProvider,
  type GeminiObservation,
} from "@/server/providers/gemini-runtime";

type HarnessResult = {
  status: "success" | "warning" | "error";
  summary: string;
  next_actions: string[];
  artifacts: string[];
  metrics?: Record<string, number | string>;
  checks?: Record<string, boolean | string>;
  observations?: GeminiObservation[];
};

function emit(result: HarnessResult): void {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function job(prompt: string): CareJob {
  const now = new Date().toISOString();
  return careJobSchema.parse({
    id: crypto.randomUUID(),
    ownerId: "gemini-harness",
    title: "Gemini harness illustration",
    prompt,
    audience: "children-6-9",
    mode: "img2img",
    inputUrl: "/assets/carecanvas-source.svg",
    status: "draft",
    attempts: 0,
    simulateFirstQaFailure: false,
    trace: [],
    createdAt: now,
    updatedAt: now,
  });
}

async function main(): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    emit({
      status: "error",
      summary: "Gemini harness did not run because GEMINI_API_KEY is not configured.",
      next_actions: [
        "Add GEMINI_API_KEY to .env.local or a server-only deployment environment, then rerun npm run harness:gemini.",
      ],
      artifacts: ["scripts/gemini-harness.ts", "src/server/providers/gemini-runtime.ts"],
    });
    process.exitCode = 2;
    return;
  }

  const model = process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash";
  const observations: GeminiObservation[] = [];
  const provider = new GeminiIntelligenceProvider(apiKey, model, {
    appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    onObservation: (observation) => observations.push(observation),
  });

  const started = performance.now();
  try {
    const safeJob = job(
      "Turn the central character into a calm red panda holding a blank emotion card. Preserve the quiet reading nook and leave clear facilitator space.",
    );
    const brief = await provider.createBrief(safeJob);
    const prepared = { ...safeJob, sceneBrief: brief };
    const safety = await provider.reviewSafety(prepared, brief);
    const qa = await provider.reviewImage({ ...prepared, status: "generating", attempts: 1 }, "/assets/carecanvas-result.svg", 1);

    const unsafeJob = job("Create a patient record, diagnose this real child, and prescribe a cure.");
    const blockedBrief = await provider.createBrief(unsafeJob);
    const blocked = await provider.reviewSafety({ ...unsafeJob, sceneBrief: blockedBrief }, blockedBrief);

    const schemaPasses = [Boolean(brief.refinedPrompt), Boolean(safety.agent), Boolean(qa.agent), Boolean(blocked.agent)].filter(Boolean).length;
    const successfulCalls = observations.filter((observation) => observation.status === "success").length;
    const totalTokens = observations.reduce((sum, observation) => sum + (observation.tokenUsage?.total ?? 0), 0);
    const checks = {
      safe_brief_contract: brief.agent === "brief-agent",
      safe_request_passed: safety.verdict === "pass" && safety.childSafe && safety.medicalClaimFree,
      visual_qa_contract: qa.agent === "visual-qa-agent",
      unsafe_request_blocked_without_model_spend: blocked.verdict === "block" && observations.length === 3,
    };
    const allPassed = Object.values(checks).every(Boolean);

    emit({
      status: allPassed ? "success" : "warning",
      summary: allPassed
        ? "Gemini completed all three CareCanvas intelligence stages and the deterministic safety stop passed."
        : "Gemini returned valid contracts, but at least one acceptance expectation needs review.",
      next_actions: allPassed
        ? ["Set CARECANVAS_MODE=harness and CARECANVAS_INTELLIGENCE_PROVIDER=gemini for a bounded deployment smoke test."]
        : ["Review the boolean checks below before enabling the public harness."],
      artifacts: ["src/server/providers/gemini-runtime.ts", "scripts/gemini-harness.ts"],
      metrics: {
        model,
        provider_calls: observations.length,
        schema_pass_rate: schemaPasses / 4,
        pass_at_1: observations.length > 0 ? successfulCalls / observations.length : 0,
        sdk_max_attempts_per_call: 2,
        total_tokens: totalTokens,
        total_latency_ms: Math.round(performance.now() - started),
      },
      checks,
      observations,
    });
    if (!allPassed) process.exitCode = 1;
  } catch (error) {
    emit({
      status: "error",
      summary: error instanceof Error ? error.message : "Gemini harness failed at an unknown boundary.",
      next_actions: ["Use the sanitized stage observation to fix the root cause; do not retry more than once without a state change."],
      artifacts: ["src/server/providers/gemini-runtime.ts", "scripts/gemini-harness.ts"],
      metrics: {
        model,
        provider_calls: observations.length,
        total_latency_ms: Math.round(performance.now() - started),
      },
      observations,
    });
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  emit({
    status: "error",
    summary: error instanceof Error ? error.message : "Gemini harness failed before execution.",
    next_actions: ["Check the server-only harness configuration before retrying."],
    artifacts: ["scripts/gemini-harness.ts"],
  });
  process.exitCode = 1;
});
