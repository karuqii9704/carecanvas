# CareCanvas

CareCanvas is a human-gated AI illustration pipeline for health, wellbeing, and children's teams. It demonstrates how a small multi-agent workflow can be inspectable, cost-bounded, and safe by construction instead of hiding everything behind one prompt.

The public application runs in **deterministic demo mode by default**. It needs no account, API key, external request, or paid generation. A separate harness profile can exercise either Gemini or Anthropic for the three intelligence stages while keeping image generation deterministic. Durable live mode remains an explicit, fully configured opt-in.

**Public demo:** [carecanvas.vercel.app](https://carecanvas.vercel.app/)

> **Current verification boundary:** the Gemini adapter and acceptance harness are implemented, but no Gemini key is configured in this workspace or public deployment. The Gemini path has therefore not yet been live-tested against Google's API. Demo results are deterministic and must not be described as Gemini, Claude, or Flux output.

## What it proves

- Full-stack Next.js 16 / React 19 / strict TypeScript implementation.
- Brief, safety, and visual-QA agents behind a provider-neutral interface.
- Explicit Gemini or Anthropic selection for real intelligence calls.
- JSON-schema-constrained Gemini output followed by Zod domain validation.
- A mandatory human approval before the image stage.
- A bounded Gemini harness with a deterministic image adapter and sanitized stage observations.
- Durable Inngest steps, a 24-hour approval wait, and a maximum of one corrective retry in live mode.
- fal.ai Flux Kontext (img2img) and Flux Fill (mask-based inpainting) adapters.
- Supabase Auth, private Storage, Postgres persistence, and explicit RLS policies.
- Raw-body Ed25519 fal webhook verification, a five-minute timestamp window, JWKS caching, and replay rejection.
- Visible traces with redacted provider IDs, status, timing, attempts, and recovery decisions.

## Execution profiles

| Profile | Intelligence | Image stage | State and orchestration | Intended use |
|---|---|---|---|---|
| `demo` | Deterministic local adapter | Deterministic bundled image adapter | In-memory repository; synchronous pipeline | Public, free, repeatable demonstration |
| `harness` | Real Gemini **or** Anthropic calls | Deterministic bundled image adapter | In-memory repository; synchronous pipeline | Bounded provider verification without fal, Inngest, or Supabase |
| `live` | Real Gemini **or** Anthropic calls | fal.ai Flux | Supabase persistence/Auth and durable Inngest execution | Fully configured end-to-end deployment |

`CARECANVAS_INTELLIGENCE_PROVIDER=gemini` selects Gemini; `anthropic` selects Claude. The setting only causes external model calls in `harness` or `live`. In `demo`, both intelligence and image work remain deterministic regardless of the selected provider label.

## Run the deterministic demo

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

The public demo previously completed the forced recovery path in two attempts with eight trace steps and a final deterministic QA score of 96. That result validates the deterministic state-machine path, not a paid AI provider.

## Run the Gemini acceptance harness

The standalone harness exercises real Gemini calls for structured brief creation, safety review, and visual QA against bundled synthetic inputs. It does **not** call fal.ai, Inngest, or Supabase, and its image stage is deterministic.

1. Copy `.env.example` to `.env.local`.
2. Add the key only to the server-side environment file:

   ```dotenv
   GEMINI_API_KEY=your_server_only_key
   GEMINI_MODEL=gemini-3.5-flash
   ```

3. Run:

   ```bash
   npm run harness:gemini
   ```

The command emits one JSON report containing contract checks, sanitized stage observations, latency, token usage when returned by the API, and suggested next actions. It also verifies that an explicitly unsafe synthetic request is stopped by the deterministic pre-model safety boundary.

To exercise the same provider through the local web application while retaining deterministic image output, use:

```dotenv
CARECANVAS_MODE=harness
CARECANVAS_INTELLIGENCE_PROVIDER=gemini
GEMINI_API_KEY=your_server_only_key
GEMINI_MODEL=gemini-3.5-flash
```

For Anthropic, set `CARECANVAS_INTELLIGENCE_PROVIDER=anthropic` and provide `ANTHROPIC_API_KEY` plus the desired `ANTHROPIC_MODEL` instead.

Never prefix provider credentials with `NEXT_PUBLIC_`, commit `.env.local`, embed a key in client code, or paste a key into a browser form. Restart the development server after changing environment variables.

## Durable live mode

1. Copy `.env.example` to `.env.local`.
2. Apply `supabase/migrations/202607200001_init_carecanvas.sql` to a Supabase project.
3. Select `gemini` or `anthropic` and configure that provider's server-only key.
4. Configure all fal.ai, Inngest, and Supabase values.
5. Set `CARECANVAS_MODE=live` only after the full environment is present.
6. Sync `/api/inngest` with Inngest and register the public HTTPS `/api/fal/webhook` URL with fal.

Live mode fails configuration validation when the selected intelligence key or any durable-stack credential is missing. It requires a Supabase bearer token for application routes. The browser never receives `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `FAL_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, or Inngest signing credentials.

The fal, Inngest, and Supabase adapters are preserved as the durable live architecture, but this repository does not claim that the complete paid-provider path has been production-certified.

> This is an engineering portfolio prototype, not a medical product. It uses synthetic prompts and bundled art, does not diagnose or treat, and does not train on user uploads.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Engineering case study](docs/CASE_STUDY.md)
- [Database and RLS migration](supabase/migrations/202607200001_init_carecanvas.sql)

Built by **Rifqi Sigwan Nugraha**.
