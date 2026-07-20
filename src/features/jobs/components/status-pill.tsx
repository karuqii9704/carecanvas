import type { JobStatus } from "@/domain/job";

const labels: Record<JobStatus, string> = {
  draft: "Draft",
  reviewing: "Agents reviewing",
  blocked: "Blocked safely",
  awaiting_approval: "Needs approval",
  generating: "Generating",
  qa_review: "Visual QA",
  completed: "Released",
  needs_human_review: "Human review",
  failed: "Failed safely",
  expired: "Expired",
};

export function StatusPill({ status }: { status: JobStatus }) {
  return <span className={`status-pill status-${status}`}>{labels[status]}</span>;
}
