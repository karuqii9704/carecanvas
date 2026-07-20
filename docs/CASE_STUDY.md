# Engineering case study

## Problem

AI image demos often optimize for the happy path: one prompt enters, one image appears, and the decisions between them are invisible. That is a poor fit for children's and wellbeing work, where a team needs to know what was approved, why a request stopped, and how much an autonomous retry can spend.

## Design decision

CareCanvas treats image generation as a state machine, not a chat response. Three narrow agents structure, screen, and evaluate the request. A human sees the refined brief before the provider call. The visual-QA agent may request exactly one correction; after that, ownership returns to a person.

The public demo deliberately uses local vector assets and deterministic provider adapters. This keeps the recruiter experience fast, repeatable, and free while proving the same branches used by live providers.

## Debugging surface

The trace is part of the product rather than an admin afterthought. Each step records:

- agent or provider boundary;
- terminal/waiting state;
- duration and attempt number;
- concise decision or failure reason;
- redacted provider request ID.

The **Reliability drill** makes a controlled QA defect observable. Attempt one is rejected for accidental text-like marks, a correction is appended, and attempt two passes. This tests the recovery path without fabricating a production incident.

## Security posture

- Live provider keys exist only in server modules and environment variables.
- Supabase data and Storage use owner-scoped RLS; pipeline mutations are service-role only.
- fal webhooks use the provider's Ed25519 JWKS, raw-body hashing, a five-minute timestamp window, and replay tracking.
- Requests are schema-limited and generation is protected by rate and lifetime budgets.
- No real child, patient, or health record is used.

## Result

The result is a small but complete full-stack artifact that can demonstrate img2img, inpainting, human-in-the-loop orchestration, failure classification, retry limits, and privacy boundaries in a short technical walkthrough. It is intentionally a portfolio prototype; deployment metrics and user outcomes are not claimed.
