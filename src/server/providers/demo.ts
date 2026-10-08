import type { CareJob, QaReview, SafetyReview, SceneBrief } from "@/domain/job";
import { deriveSceneSpec, describeScene, parseSceneSlug, sceneUrl, subjectLabel } from "@/domain/scene";
import type { ImageProvider, IntelligenceProvider } from "@/server/providers/contracts";

const blockedTerms = ["sexual", "self-harm", "weapon", "diagnose", "cure", "patient record"];

export class DemoIntelligenceProvider implements IntelligenceProvider {
  async createBrief(job: CareJob): Promise<SceneBrief> {
    const spec = deriveSceneSpec(job, 1);
    return {
      refinedPrompt: `${job.prompt} Use calm editorial shapes, a restrained teal and terracotta palette, clear focal hierarchy, and no readable text.`,
      visualIntent: `${describeScene(spec)} — a respectful ${job.audience.replaceAll("-", " ")} visual that helps a facilitator begin a conversation.`,
      preserve: [`${subjectLabel(spec.subject)} as the central character`, "primary composition", "breathing room"],
      avoid: ["medical diagnosis", "readable text", "branding", "distressing imagery"],
      agent: "brief-agent",
    };
  }

  async reviewSafety(job: CareJob): Promise<SafetyReview> {
    const hit = blockedTerms.find((term) => job.prompt.toLowerCase().includes(term));
    return {
      verdict: hit ? "block" : "pass",
      reasons: hit
        ? [`Policy term requires human review: ${hit}`]
        : ["No diagnosis or treatment claim", "No identifying child data", "Age-appropriate creative direction"],
      childSafe: !hit,
      medicalClaimFree: !job.prompt.toLowerCase().includes("cure"),
      agent: "safety-agent",
    };
  }

  async reviewImage(job: CareJob, outputUrl: string, attempt: number): Promise<QaReview> {
    const rendered = parseSceneSlug(outputUrl);
    const requested = deriveSceneSpec(job, attempt);
    if (job.simulateFirstQaFailure && attempt === 1) {
      return {
        verdict: "retry",
        score: 71,
        correction: "Remove accidental micro-text and restore clear whitespace around the activity card.",
        checks: [
          { label: "Brief alignment", passed: true, note: "Subject and tone match the approved brief." },
          { label: "Child-safe visual", passed: true, note: "No unsafe visual content detected." },
          { label: "Text integrity", passed: false, note: "Small generated marks resemble unreadable text." },
        ],
        agent: "visual-qa-agent",
      };
    }
    // The deterministic QA compares what was drawn with what the direction asked for.
    const subjectMatches = !rendered || rendered.subject === requested.subject;
    const genericSubject = rendered?.subject === "friend";
    const alignment = !rendered
      ? "Composition and intent match the approved brief."
      : genericSubject
        ? "No known animal in the direction, so a generic friendly character was drawn."
        : `${describeScene(rendered)}, as directed.`;
    return {
      verdict: subjectMatches ? "pass" : "retry",
      score: !subjectMatches ? 62 : genericSubject ? 84 : attempt === 1 ? 94 : 96,
      correction: subjectMatches ? undefined : `Redraw the central character as a ${subjectLabel(requested.subject)}.`,
      checks: [
        { label: "Brief alignment", passed: subjectMatches, note: alignment },
        { label: "Child-safe visual", passed: true, note: "No unsafe or identifying visual content detected." },
        { label: "Text integrity", passed: true, note: "No accidental lettering found." },
      ],
      agent: "visual-qa-agent",
    };
  }
}

/**
 * Composes the picture from the direction with the deterministic illustrator,
 * so the output follows the requested subject without any paid image model.
 */
export class DemoImageProvider implements ImageProvider {
  async submit(job: CareJob, brief: SceneBrief, attempt: number) {
    const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
    return {
      requestId: `demo_${job.mode}_${suffix}`,
      immediateOutputUrl: sceneUrl(deriveSceneSpec({ ...job, sceneBrief: brief }, attempt)),
    };
  }
}
