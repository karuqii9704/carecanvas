import { ArrowDown, Check, Github, Workflow } from "lucide-react";

import { seedJob } from "@/domain/demo-data";
import { Workbench } from "@/features/jobs/components/workbench";
import { getExecutionProfile, getServerEnv } from "@/server/env";

export default function Home() {
  const env = getServerEnv();
  const executionProfile = getExecutionProfile(env);
  const intelligenceLabel = env.CARECANVAS_INTELLIGENCE_PROVIDER === "gemini" ? "Gemini" : "Claude";
  const stack =
    executionProfile === "harness"
      ? ["Next.js 16", `${intelligenceLabel} live agents`, "Bundled image adapter", "Human approval", "Trace harness"]
      : ["Next.js 16", `${intelligenceLabel} adapter`, "fal.ai Flux adapters", "Supabase", "Inngest"];
  return (
    <main>
      <header className="site-header">
        <a href="#top" className="brand"><span>CC</span><strong>CareCanvas</strong></a>
        <nav aria-label="Primary navigation">
          <a href="#pipeline">Pipeline</a>
          <a href="#architecture">Architecture</a>
          <a href="https://github.com/karuqii9704/carecanvas" target="_blank" rel="noreferrer"><Github aria-hidden="true" /> GitHub</a>
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <span className="eyebrow"><i /> PORTFOLIO PROTOTYPE · BUILT FOR PURPOSE-LED TEAMS</span>
          <h1>AI illustration,<br />with a human <em>in the loop.</em></h1>
          <p>CareCanvas turns a visual brief into a child-appropriate illustration through bounded agents, an explicit approval gate, durable execution, and a trace you can actually debug.</p>
          <div className="hero-actions">
            <a href="#pipeline" className="primary-button">Try the pipeline <ArrowDown aria-hidden="true" /></a>
            <a href="#architecture" className="text-link"><Workflow aria-hidden="true" /> See how it fails safely</a>
          </div>
        </div>
        <aside className="hero-proof" aria-label="Pipeline guarantees">
          <span className="proof-index">RUN POLICY / 01</span>
          <div className="proof-item"><Check aria-hidden="true" /><div><strong>Human spend gate</strong><p>No image provider call before approval.</p></div></div>
          <div className="proof-item"><Check aria-hidden="true" /><div><strong>Bounded correction</strong><p>One QA retry, then a person decides.</p></div></div>
          <div className="proof-item"><Check aria-hidden="true" /><div><strong>Reproducible trace</strong><p>State, timing and failure reason stay visible.</p></div></div>
          <div className="proof-footer">
            <span>{executionProfile === "live" ? "Configured live ceiling" : executionProfile === "harness" ? "Live intelligence" : "Public demo cost"}</span>
            <strong className="tabular">
              {executionProfile === "live" ? `${env.CARECANVAS_LIFETIME_LIMIT} jobs` : executionProfile === "harness" ? `${intelligenceLabel} API` : "0 provider calls"}
            </strong>
          </div>
        </aside>
      </section>

      <div className="stack-strip" aria-label="Technology stack">{stack.map((item) => <span key={item}>{item}</span>)}</div>

      <section id="pipeline" className="pipeline-section">
        <Workbench initialJob={seedJob} executionProfile={executionProfile} intelligenceLabel={intelligenceLabel} />
      </section>

      <section id="architecture" className="architecture-section">
        <div className="section-heading">
          <div><span className="eyebrow">SYSTEM DESIGN</span><h2>Small agents. Explicit boundaries.</h2></div>
          <p>The model proposes. Policy and people decide. Durable steps make every failure recoverable instead of mysterious.</p>
        </div>
        <div className="architecture-grid">
          {[
            ["01", "Brief agent", "Structures intent into preserve and avoid constraints. It cannot release an image."],
            ["02", "Safety agent", "Blocks unsafe or medicalized direction before generation. It cannot override a person."],
            ["03", "Human gate", "Reviews the actual refined brief before any paid provider request is submitted."],
            ["04", "Visual QA", "Scores alignment and safety. It gets one corrective retry—not an infinite loop."],
          ].map(([number, title, copy]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{copy}</p></article>)}
        </div>
        <div className="failure-table" role="region" aria-label="Failure mode handling" tabIndex={0}>
          <div className="failure-row header"><span>Failure mode</span><span>Detected by</span><span>Recovery</span></div>
          <div className="failure-row"><strong>Unsafe brief</strong><span>Safety agent</span><span>Stop before spend</span></div>
          <div className="failure-row"><strong>Provider timeout</strong><span>Inngest trace</span><span>Two durable attempts</span></div>
          <div className="failure-row"><strong>Visual defect</strong><span>Vision QA</span><span>One corrected retry</span></div>
          <div className="failure-row"><strong>Repeated defect</strong><span>Retry boundary</span><span>Human review queue</span></div>
        </div>
      </section>

      <footer>
        <div><strong>CareCanvas</strong><p>A deliberately scoped engineering prototype—never medical advice and never trained on user uploads.</p></div>
        <div><span>Designed & engineered by</span><strong>Rifqi Sigwan Nugraha</strong></div>
      </footer>
    </main>
  );
}
