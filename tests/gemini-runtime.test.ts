import type { GenerateContentParameters, GenerateContentResponse } from "@google/genai";
import { describe, expect, it, vi } from "vitest";

import { careJobSchema, type CareJob, type SceneBrief } from "@/domain/job";
import {
  GeminiIntelligenceProvider,
  GeminiProviderError,
  type GeminiImageInput,
  type GeminiObservation,
} from "@/server/providers/gemini-runtime";

const validBrief: SceneBrief = {
  refinedPrompt: "Keep the quiet reading nook and replace the central figure with a friendly turtle.",
  visualIntent: "A calm, welcoming activity card for younger children.",
  preserve: ["quiet reading nook", "soft composition"],
  avoid: ["readable text", "frightening imagery"],
  agent: "brief-agent",
};

function makeJob(overrides: Partial<CareJob> = {}): CareJob {
  return careJobSchema.parse({
    id: "318e6ab6-cbac-47d9-8214-57a8bd5d1827",
    ownerId: "test-owner",
    title: "Calm activity card",
    prompt: "Replace the central figure with a friendly turtle and retain the quiet reading nook.",
    audience: "children-6-9",
    mode: "img2img",
    inputUrl: "/assets/carecanvas-source.svg",
    simulateFirstQaFailure: false,
    status: "reviewing",
    attempts: 0,
    trace: [],
    createdAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-20T00:00:00.000Z",
    ...overrides,
  });
}

function sdkResponse(text: string | undefined, overrides: Partial<GenerateContentResponse> = {}): GenerateContentResponse {
  return {
    text,
    ...overrides,
  } as GenerateContentResponse;
}

function providerWithResponse(response: GenerateContentResponse, onObservation?: (observation: GeminiObservation) => void) {
  const generateContent = vi.fn(async (parameters: GenerateContentParameters) => {
    void parameters;
    return response;
  });
  const provider = new GeminiIntelligenceProvider("test-only-key", "gemini-test-model", {
    client: { generateContent },
    onObservation,
  });
  return { generateContent, provider };
}

describe("GeminiIntelligenceProvider structured contracts", () => {
  it("returns a domain-valid scene brief and records bounded usage metadata", async () => {
    const observations: GeminiObservation[] = [];
    const { generateContent, provider } = providerWithResponse(
      sdkResponse(JSON.stringify(validBrief), {
        usageMetadata: {
          promptTokenCount: 31,
          candidatesTokenCount: 19,
          totalTokenCount: 50,
        },
      }),
      (observation) => observations.push(observation),
    );

    await expect(provider.createBrief(makeJob())).resolves.toEqual(validBrief);
    expect(generateContent).toHaveBeenCalledOnce();

    const request = generateContent.mock.calls[0]![0];
    expect(request).toMatchObject({
      model: "gemini-test-model",
      config: {
        temperature: 0,
        maxOutputTokens: 1_200,
        responseMimeType: "application/json",
      },
    });
    expect(request.config?.responseJsonSchema).toBeDefined();
    expect(observations).toEqual([
      expect.objectContaining({
        status: "success",
        stage: "brief",
        tokenUsage: { prompt: 31, output: 19, total: 50 },
      }),
    ]);
  });

  it.each([
    ["malformed JSON", "not-json", "Gemini returned an invalid JSON contract."],
    [
      "domain-invalid JSON",
      JSON.stringify({ ...validBrief, refinedPrompt: "too short", agent: "wrong-agent" }),
      "Gemini returned an invalid domain contract.",
    ],
  ])("rejects %s as a sanitized contract error", async (_label, text, message) => {
    const observations: GeminiObservation[] = [];
    const { provider } = providerWithResponse(sdkResponse(text), (observation) => observations.push(observation));

    const error = await provider.createBrief(makeJob()).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(GeminiProviderError);
    expect(error).toMatchObject({ code: "contract", stage: "brief", message });
    expect(observations.at(-1)).toMatchObject({
      status: "error",
      stage: "brief",
      summary: message,
    });
  });
});

describe("GeminiIntelligenceProvider safety boundaries", () => {
  it("fails closed when a pass verdict conflicts with structured safety flags", async () => {
    const { provider } = providerWithResponse(
      sdkResponse(
        JSON.stringify({
          verdict: "pass",
          reasons: [],
          childSafe: false,
          medicalClaimFree: true,
          agent: "safety-agent",
        }),
      ),
    );

    await expect(provider.reviewSafety(makeJob(), validBrief)).resolves.toEqual({
      verdict: "human_review",
      reasons: ["Structured safety flags conflict with a pass verdict."],
      childSafe: false,
      medicalClaimFree: true,
      agent: "safety-agent",
    });
  });

  it("turns a Gemini safety-filter block into human review instead of allowing the job", async () => {
    const { provider } = providerWithResponse(
      sdkResponse(undefined, { promptFeedback: { blockReason: "SAFETY" } } as Partial<GenerateContentResponse>),
    );

    await expect(provider.reviewSafety(makeJob(), validBrief)).resolves.toMatchObject({
      verdict: "human_review",
      childSafe: false,
      medicalClaimFree: false,
      agent: "safety-agent",
    });
  });

  it("blocks deterministic unsafe requests without making any Gemini client calls", async () => {
    const { generateContent, provider } = providerWithResponse(sdkResponse(JSON.stringify(validBrief)));
    const unsafeJob = makeJob({
      prompt: "Create a patient record, diagnose this real child, and include the child's full name.",
    });

    const brief = await provider.createBrief(unsafeJob);
    const safety = await provider.reviewSafety(unsafeJob, brief);

    expect(brief.refinedPrompt).toMatch(/qualified human reviewer/i);
    expect(safety).toMatchObject({
      verdict: "block",
      childSafe: false,
      medicalClaimFree: false,
    });
    expect(safety.reasons).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/medical|diagnostic/i),
        expect.stringMatching(/identifying child data/i),
      ]),
    );
    expect(generateContent).not.toHaveBeenCalled();
  });
});

describe("GeminiIntelligenceProvider visual QA", () => {
  it.each([
    [
      "pass with a failed check",
      {
        verdict: "pass",
        score: 92,
        checks: [{ label: "brief fidelity", passed: false, note: "The main subject changed." }],
        agent: "visual-qa-agent",
      },
    ],
    [
      "retry without a correction",
      {
        verdict: "retry",
        score: 62,
        checks: [{ label: "brief fidelity", passed: true, note: "Most details match." }],
        correction: "   ",
        agent: "visual-qa-agent",
      },
    ],
  ])("fails closed for %s", async (_label, qaPayload) => {
    const imageLoader = vi.fn(async (): Promise<GeminiImageInput> => ({ mimeType: "image/png", data: "cG5n" }));
    const generateContent = vi.fn(async (parameters: GenerateContentParameters) => {
      void parameters;
      return sdkResponse(JSON.stringify(qaPayload));
    });
    const provider = new GeminiIntelligenceProvider("test-only-key", "gemini-test-model", {
      client: { generateContent },
      imageLoader,
    });

    await expect(
      provider.reviewImage(makeJob({ sceneBrief: validBrief }), "https://fal.media/output.png", 1),
    ).resolves.toMatchObject({ verdict: "human_review" });
  });

  it("passes an injected PNG as inline vision data rather than exposing the source URL to Gemini", async () => {
    const inlinePng: GeminiImageInput = {
      mimeType: "image/png",
      data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
    };
    const imageLoader = vi.fn(async () => inlinePng);
    const generateContent = vi.fn(async (parameters: GenerateContentParameters) => {
      void parameters;
      return sdkResponse(
        JSON.stringify({
          verdict: "pass",
          score: 96,
          checks: [{ label: "brief fidelity", passed: true, note: "The approved brief is preserved." }],
          agent: "visual-qa-agent",
        }),
      );
    });
    const provider = new GeminiIntelligenceProvider("test-only-key", "gemini-test-model", {
      client: { generateContent },
      imageLoader,
    });
    const sourceUrl = "https://fal.media/private-output.png";

    await expect(provider.reviewImage(makeJob({ sceneBrief: validBrief }), sourceUrl, 2)).resolves.toMatchObject({
      verdict: "pass",
      score: 96,
    });

    expect(imageLoader).toHaveBeenCalledWith(sourceUrl);
    const request = generateContent.mock.calls[0]![0];
    expect(request.contents).toEqual([
      expect.objectContaining({ text: expect.any(String) }),
      { inlineData: inlinePng },
    ]);
    expect(JSON.stringify(request)).not.toContain(sourceUrl);
  });
});

describe("GeminiIntelligenceProvider error sanitization", () => {
  it.each([
    [401, "auth", "Gemini authentication failed."],
    [429, "quota", "Gemini quota is temporarily unavailable."],
    [503, "unavailable", "Gemini is temporarily unavailable."],
  ] as const)("maps provider status %s without leaking upstream details", async (status, code, safeMessage) => {
    const rawSecret = "AIza-test-secret-that-must-not-leak";
    const generateContent = vi.fn(async (parameters: GenerateContentParameters) => {
      void parameters;
      throw Object.assign(new Error(`upstream ${status}: ${rawSecret}; request=${makeJob().prompt}`), { status });
    });
    const observations: GeminiObservation[] = [];
    const provider = new GeminiIntelligenceProvider("test-only-key", "gemini-test-model", {
      client: { generateContent },
      onObservation: (observation) => observations.push(observation),
    });

    const error = await provider.createBrief(makeJob()).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code, stage: "brief", message: safeMessage });
    expect(String(error)).not.toContain(rawSecret);
    expect(String(error)).not.toContain(makeJob().prompt);
    expect(JSON.stringify(observations)).not.toContain(rawSecret);
    expect(observations.at(-1)?.summary).toBe(safeMessage);
  });

  it("sanitizes unknown provider failures as a bounded request error", async () => {
    const generateContent = vi.fn(async (parameters: GenerateContentParameters) => {
      void parameters;
      throw new Error("socket failed while sending GEMINI_API_KEY=raw-secret");
    });
    const provider = new GeminiIntelligenceProvider("test-only-key", "gemini-test-model", {
      client: { generateContent },
    });

    await expect(provider.createBrief(makeJob())).rejects.toMatchObject({
      code: "request",
      stage: "brief",
      message: "Gemini could not complete this bounded stage.",
    });
  });
});
