"use client";

import { useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import { ArrowRight, Check, FlaskConical, ImageIcon, LockKeyhole, RotateCcw, ShieldCheck, Sparkles } from "lucide-react";

import type { CareJob, EditMode } from "@/domain/job";
import { describeImageStage } from "@/features/jobs/image-stage";
import { StatusPill } from "@/features/jobs/components/status-pill";
import { TracePanel } from "@/features/jobs/components/trace-panel";

type ApiResponse = { job?: CareJob; error?: string; execution?: string; trialsRemaining?: number };
type ExecutionProfile = "demo" | "harness" | "live";

const sourceUrl = "/assets/carecanvas-source.svg";
const maskUrl = "/assets/carecanvas-mask.svg";

export function Workbench({
  initialJob,
  executionProfile,
  intelligenceLabel,
}: {
  initialJob: CareJob;
  executionProfile: ExecutionProfile;
  intelligenceLabel: "Gemini" | "Claude";
}) {
  const [job, setJob] = useState(initialJob);
  const [mode, setMode] = useState<EditMode>("img2img");
  const [prompt, setPrompt] = useState(
    "Turn the central character into a calm, friendly red panda holding an emotion card. Preserve the quiet reading nook and leave generous space for facilitator copy.",
  );
  const [simulateRetry, setSimulateRetry] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [trialsLeft, setTrialsLeft] = useState<number | null>(null);
  const durableLive = executionProfile === "live";

  useEffect(() => {
    if (!durableLive || !["draft", "reviewing", "generating", "qa_review"].includes(job.status)) return;
    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/jobs/${job.id}`, { cache: "no-store" });
      if (!response.ok) return;
      const payload = (await response.json()) as ApiResponse;
      if (payload.job) setJob(payload.job);
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [durableLive, job.id, job.status]);

  async function submitJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: mode === "inpaint" ? "Calm character replacement" : "Name the feeling",
          prompt,
          audience: "children-6-9",
          mode,
          inputUrl: sourceUrl,
          maskUrl: mode === "inpaint" ? maskUrl : undefined,
          simulateFirstQaFailure: simulateRetry,
        }),
      });
      const payload = (await response.json()) as ApiResponse;
      if (!response.ok || !payload.job) {
        if (typeof payload.trialsRemaining === "number") setTrialsLeft(payload.trialsRemaining);
        throw new Error(payload.error ?? "The job could not be created.");
      }
      setJob(payload.job);
      if (typeof payload.trialsRemaining === "number") setTrialsLeft(payload.trialsRemaining);
      setNotice(
        payload.execution?.endsWith("-harness")
          ? `${intelligenceLabel} returned a structured brief and safety decision. Review it before the image stage.`
          : payload.execution === "deterministic-demo"
            ? "Three deterministic gates passed. Review the agent brief before continuing."
            : "Durable workflow accepted. The trace will update as agents finish.",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unexpected request error.");
    } finally {
      setBusy(false);
    }
  }

  async function decide(decision: "approved" | "rejected") {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/jobs/${job.id}/approval`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision, note: decision === "approved" ? "Brief checked by content lead." : "Creative direction needs revision." }),
      });
      const payload = (await response.json()) as ApiResponse;
      if (!response.ok || !payload.job) throw new Error(payload.error ?? "Approval could not be recorded.");
      setJob(payload.job);
      setNotice(decision === "approved" ? "Human approval recorded. The bounded pipeline continued." : "Stopped before image generation.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unexpected approval error.");
    } finally {
      setBusy(false);
    }
  }

  function resetDemo() {
    setJob(initialJob);
    setError(null);
    setNotice("Seeded evidence restored.");
  }

  const output = job.outputUrl ?? sourceUrl;
  const imageStage = describeImageStage(executionProfile, Boolean(job.outputUrl));

  return (
    <div className="workbench">
      <div className="workbench-bar">
        <div>
          <span className="eyebrow">INTERACTIVE PIPELINE</span>
          <h2>Move from brief to approved visual.</h2>
        </div>
        <div className="mode-indicator">
          <span aria-hidden="true" />{" "}
          {executionProfile === "live"
            ? "Durable live mode"
            : executionProfile === "harness"
              ? `${intelligenceLabel} harness`
              : "Safe demo mode"}
          {typeof trialsLeft === "number" ? (
            <span className="trial-count">· {trialsLeft} trials left today</span>
          ) : null}
        </div>
      </div>

      <div className="workbench-grid">
        <section className="composer" aria-labelledby="composer-title">
          <div className="panel-heading">
            <span className="step-number">01</span>
            <div><h3 id="composer-title">Creative brief</h3><p>No sensitive or real child data.</p></div>
          </div>

          <form onSubmit={submitJob}>
            <fieldset className="mode-picker">
              <legend>Edit mode</legend>
              <label className={mode === "img2img" ? "selected" : ""}>
                <input type="radio" name="mode" value="img2img" checked={mode === "img2img"} onChange={() => setMode("img2img")} />
                <ImageIcon aria-hidden="true" />
                <span><strong>Image-to-image</strong><small>Rework the whole scene</small></span>
              </label>
              <label className={mode === "inpaint" ? "selected" : ""}>
                <input type="radio" name="mode" value="inpaint" checked={mode === "inpaint"} onChange={() => setMode("inpaint")} />
                <Sparkles aria-hidden="true" />
                <span><strong>Inpainting</strong><small>Replace only the mask</small></span>
              </label>
            </fieldset>

            <label className="field-label" htmlFor="prompt">Direction</label>
            <textarea id="prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} minLength={20} maxLength={1200} rows={6} aria-describedby={durableLive ? undefined : "prompt-scope"} />
            {/* Say what the direction actually drives before it is written. The
                same boundary stated only after generation reads as a failure. */}
            {durableLive ? null : (
              <p className="field-scope" id="prompt-scope">
                Outside live mode your direction drives the agent brief, safety decision, and QA — not the picture. The image stage returns fixed artwork.
              </p>
            )}
            <div className="field-meta"><span>Audience · children 6–9</span><span className="tabular">{prompt.length}/1,200</span></div>

            <label className="reliability-toggle">
              <input type="checkbox" checked={simulateRetry} onChange={(event) => setSimulateRetry(event.target.checked)} />
              <FlaskConical aria-hidden="true" />
              <span><strong>Reliability drill</strong><small>Force QA to reject attempt one and show the bounded retry.</small></span>
            </label>

            {error ? <p className="inline-message error" role="alert">{error}</p> : null}
            {notice ? <p className="inline-message" role="status">{notice}</p> : null}

            <button className="primary-button" type="submit" disabled={busy}>
              {busy ? "Running gates…" : "Run review agents"}<ArrowRight aria-hidden="true" />
            </button>
          </form>

          <div className="privacy-line">
            <LockKeyhole aria-hidden="true" />
            <span>
              {executionProfile === "harness"
                ? `${intelligenceLabel} credentials stay server-only. The image stage uses bundled artwork.`
                : executionProfile === "live"
                  ? "Provider credentials stay server-only. Usage is bounded before generation."
                  : "Provider credentials are server-only. Demo mode makes zero external calls."}
            </span>
          </div>
        </section>

        <section className="preview-panel" aria-labelledby="preview-title">
          <div className="preview-topline">
            <div><span className="eyebrow">OUTPUT REVIEW</span><h3 id="preview-title">{job.title}</h3></div>
            <StatusPill status={job.status} />
          </div>

          <div className="image-stage">
            <Image src={output} alt={job.outputUrl ? "CareCanvas generated wellbeing illustration" : "Source illustration awaiting generation"} fill priority sizes="(max-width: 900px) 100vw, 48vw" />
            <span className="image-label">{imageStage.label}</span>
          </div>

          {imageStage.note ? <p className="image-note">{imageStage.note}</p> : null}

          {job.sceneBrief ? (
            <div className="brief-review">
              <div className="brief-heading"><ShieldCheck aria-hidden="true" /><strong>Agent brief</strong></div>
              <p>{job.sceneBrief.visualIntent}</p>
              <div className="constraint-grid">
                <div><span>Preserve</span><ul>{job.sceneBrief.preserve.slice(0, 3).map((item) => <li key={item}>{item}</li>)}</ul></div>
                <div><span>Avoid</span><ul>{job.sceneBrief.avoid.slice(0, 3).map((item) => <li key={item}>{item}</li>)}</ul></div>
              </div>
            </div>
          ) : null}

          {job.status === "awaiting_approval" ? (
            <div className="approval-box">
              <div><strong>Spend gate</strong><p>A person must approve this brief before the image stage runs.</p></div>
              <div className="approval-actions">
                <button type="button" className="secondary-button" onClick={() => decide("rejected")} disabled={busy}>Reject</button>
                <button type="button" className="primary-button small" onClick={() => decide("approved")} disabled={busy}><Check aria-hidden="true" /> Approve & generate</button>
              </div>
            </div>
          ) : null}

          {job.status === "needs_human_review" ? (
            <div className="approval-box">
              <div>
                <strong>Human review queue</strong>
                <p>
                  The bounded QA retry still missed the brief, so the pipeline stopped for a person instead of looping — that is
                  the designed outcome, not an error. Inspect the trace below and restore the seeded run to try again.
                </p>
              </div>
            </div>
          ) : null}

          {job.qaReview ? (
            <div className="qa-score">
              <div><span>Visual QA score</span><strong className="tabular">{job.qaReview.score}<small>/100</small></strong></div>
              <ul>{job.qaReview.checks.map((check) => <li key={check.label}><Check aria-hidden="true" /><span>{check.label}</span></li>)}</ul>
            </div>
          ) : null}

          <button type="button" className="reset-button" onClick={resetDemo}><RotateCcw aria-hidden="true" /> Restore seeded run</button>
        </section>
      </div>

      <TracePanel job={job} />
    </div>
  );
}
