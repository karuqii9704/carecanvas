import { Check, CircleAlert, Clock3, RefreshCw, ShieldCheck, UserRoundCheck } from "lucide-react";

import type { CareJob, TraceStep } from "@/domain/job";

function TraceIcon({ step }: { step: TraceStep }) {
  if (step.state === "waiting") return <UserRoundCheck aria-hidden="true" />;
  if (step.state === "warning") return <RefreshCw aria-hidden="true" />;
  if (step.state === "failed") return <CircleAlert aria-hidden="true" />;
  if (step.state === "running" || step.state === "queued") return <Clock3 aria-hidden="true" />;
  return <Check aria-hidden="true" />;
}

export function TracePanel({ job }: { job: CareJob }) {
  return (
    <section className="trace-panel" aria-labelledby="trace-title">
      <div className="section-heading compact">
        <div>
          <span className="eyebrow">RUN TRACE · {job.id.slice(0, 8).toUpperCase()}</span>
          <h2 id="trace-title">Every decision leaves evidence.</h2>
        </div>
        <div className="trace-attempts">
          <span>Attempts</span>
          <strong>{job.attempts || "—"}/2</strong>
        </div>
      </div>

      <ol className="trace-list">
        {job.trace.map((step, index) => (
          <li key={step.id} className={`trace-item trace-${step.state}`}>
            <div className="trace-rail" aria-hidden="true">
              <span className="trace-icon"><TraceIcon step={step} /></span>
              {index < job.trace.length - 1 ? <span className="trace-line" /> : null}
            </div>
            <div className="trace-copy">
              <div className="trace-title-row">
                <h3>{step.name}</h3>
                {step.durationMs !== undefined ? <span className="duration">{step.durationMs.toLocaleString()} ms</span> : <span className="duration">waiting</span>}
              </div>
              <p>{step.agent}</p>
              <small>{step.detail}</small>
              {step.providerRequestId ? <code>{step.providerRequestId}</code> : null}
            </div>
          </li>
        ))}
      </ol>

      <div className="trace-note">
        <ShieldCheck aria-hidden="true" />
        <p><strong>Trace policy:</strong> prompts and provider IDs are redacted before display. Secrets never reach the browser.</p>
      </div>
    </section>
  );
}
