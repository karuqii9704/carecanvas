# CareCanvas

CareCanvas is a human-gated AI illustration pipeline for health, wellbeing, and children's teams. It demonstrates how a small multi-agent workflow can be inspectable, cost-bounded, and safe by construction instead of hiding everything behind one prompt.

The repository runs in **deterministic demo mode by default**. No account, API key, external request, or paid generation is needed. Live mode is opt-in and only becomes available when every required provider is configured.

**Public demo:** [carecanvas.vercel.app](https://carecanvas.vercel.app/)

## What it proves

- Full-stack Next.js 16 / React 19 / strict TypeScript implementation.
- Brief, safety, and visual-QA agents behind narrow provider interfaces.
- A mandatory human approval before the first paid image request.
- Durable Inngest steps, a 24-hour approval wait, and a maximum of one corrective retry.
- fal.ai Flux Kontext (img2img) and Flux Fill (mask-based inpainting) adapters.
- Supabase Auth, private Storage, Postgres persistence, and explicit RLS policies.
- Raw-body Ed25519 fal webhook verification, ±5-minute timestamp validation, JWKS caching, and replay rejection.
- Visible traces with redacted provider IDs, status, timing, attempts, and recovery decisions.

## Run locally

Requirements: Node.js 22+

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Try both edit modes and enable **Reliability drill** to force attempt one through a QA rejection and demonstrate the bounded correction.

Quality gates:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Verified for this release: 19/19 tests, lint, strict TypeScript, and the production build pass. A public API smoke test completed the forced recovery path in two attempts with eight trace steps and a final deterministic QA score of 96.

## Live mode

1. Copy `.env.example` to `.env.local`.
2. Apply `supabase/migrations/202607200001_init_carecanvas.sql` to a Supabase project.
3. Configure all Anthropic, fal.ai, Inngest, and Supabase values.
4. Set `CARECANVAS_MODE=live` only after the full environment is present.
5. Sync `/api/inngest` with Inngest and register the public HTTPS `/api/fal/webhook` URL with fal.

Live mode requires a Supabase bearer token for application routes. The browser never receives `ANTHROPIC_API_KEY`, `FAL_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, or Inngest signing credentials.

The live adapters are implemented but were not run against paid provider accounts for this release. The deployment and screenshots therefore label bundled outputs as deterministic demo results, not as Claude or Flux generations.

> This is an engineering portfolio prototype, not a medical product. It uses synthetic prompts and bundled vector art, does not diagnose or treat, and does not train on user uploads.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Engineering case study](docs/CASE_STUDY.md)
- [Database and RLS migration](supabase/migrations/202607200001_init_carecanvas.sql)

Built by **Rifqi Sigwan Nugraha**.
