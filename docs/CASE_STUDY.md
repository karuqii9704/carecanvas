# Engineering case study

## Problem

AI image demos often optimize for the happy path: one prompt enters, one image appears, and the decisions between them are invisible. That is a poor fit for children's and wellbeing work, where a team needs to know what was approved, why a request stopped, which provider boundary failed, and how much an autonomous retry can spend.

## Design decision

CareCanvas treats image generation as a state machine, not a chat response. Three narrow agents structure, screen, and evaluate the request. A human sees the refined brief before the image stage. The visual-QA agent may request exactly one correction; after that, ownership returns to a person.

The provider interface is intentionally independent of the runtime profile. Gemini and Anthropic can each supply the structured brief, safety, and visual-QA decisions. fal.ai remains responsible for live img2img or inpainting. This keeps intelligence-provider choice separate from durable orchestration, persistence, and image generation.

## Three evidence levels

CareCanvas distinguishes three profiles so a portfolio demonstration cannot be confused with a production claim:

| Profile | Evidence produced | Deliberately excluded |
|---|---|---|
| Deterministic demo | Complete state transitions, approval gate, trace UI, bounded retry | All external calls and paid spend |
| Provider harness | Real Gemini or Anthropic brief/safety/visual-QA contracts against synthetic inputs | Real image generation, Inngest, Supabase persistence |
| Durable live | Selected intelligence provider, fal image generation, Inngest waits/retries, Supabase Auth/data/RLS | Nothing implicit: every service must be explicitly configured |

The public demo uses bundled art and deterministic adapters. This keeps the recruiter experience fast, repeatable, and free while proving the same domain branches used by the provider-backed profiles.

## Gemini integration

The Gemini adapter uses three constrained stages rather than one open-ended conversation:

1. **Brief:** converts the submitted request into a refined prompt, visual intent, and explicit preserve/avoid constraints.
2. **Safety:** evaluates child safety, privacy, and unsupported medical claims and fails closed when its flags conflict.
3. **Visual QA:** evaluates a bounded PNG against the approved brief, treats image text as untrusted, and returns a scored pass, retry, or human-review decision.

Each response is requested as schema-constrained JSON and then validated again against CareCanvas's Zod domain schema. Deterministic high-risk rules run before Gemini for clearly diagnostic, personally identifying, sexual, self-harm, or weapon-related directions. Provider errors are classified into sanitized auth, quota, timeout, availability, contract, safety, vision-input, or generic request failures.

The dedicated `npm run harness:gemini` command supplies synthetic safe and unsafe jobs, runs the three real intelligence stages against bundled assets, and reports contract checks, observations, latency, and token usage when available. The harness deliberately keeps the image provider deterministic, so a successful run would validate Gemini integration—not fal, Inngest, Supabase, or production readiness.

## Debugging surface

The trace is part of the product rather than an admin afterthought. Each step records:

- agent or provider boundary;
- terminal or waiting state;
- duration and attempt number;
- concise decision or sanitized failure reason;
- redacted provider request ID.

The deterministic **Reliability drill** makes a controlled QA defect observable. Attempt one is rejected for accidental text-like marks, a correction is appended, and attempt two passes. This tests the recovery path without fabricating a production incident.

The Gemini harness adds machine-readable observations for each provider stage. It intentionally excludes raw model payloads and secrets while retaining enough evidence to distinguish authentication, quota, timeout, schema-contract, safety, and image-boundary failures.

## Security posture

- Gemini, Anthropic, fal, Supabase service-role, and Inngest secrets exist only in server modules and environment variables.
- Provider selection is server-side; neither API key is exposed through a `NEXT_PUBLIC_` variable or browser input.
- Gemini output is constrained by JSON schema and revalidated by domain schema before entering state.
- Visual-QA image sources are allowlisted and size-bounded before becoming inline model input.
- Supabase data and Storage use owner-scoped RLS; pipeline mutations are service-role only.
- fal webhooks use the provider's Ed25519 JWKS, raw-body hashing, a five-minute timestamp window, and replay tracking.
- Requests are schema-limited and generation is protected by rate and lifetime budgets.
- No real child, patient, or health record is used.

## Result and current boundary

The result is a small but complete full-stack artifact that can demonstrate img2img, inpainting, human-in-the-loop orchestration, provider selection, failure classification, retry limits, and privacy boundaries in a short technical walkthrough.

The deterministic demo path is publicly available. The Gemini adapter and its acceptance harness are implemented, but no Gemini API key is currently configured in the workspace or deployment, so no live Gemini result is claimed yet. Likewise, the complete paid-provider path remains an engineering prototype rather than a production or clinical certification. A future successful harness report should be retained as provider evidence with its model, contract checks, sanitized observations, and timestamp—not rewritten as a broader production claim.
