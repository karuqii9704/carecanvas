import type { CareJob, QaReview, SafetyReview, SceneBrief } from "@/domain/job";
import type { ImageProvider, IntelligenceProvider } from "@/server/providers/contracts";

const blockedTerms = ["sexual", "self-harm", "weapon", "diagnose", "cure", "patient record"];

export class DemoIntelligenceProvider implements IntelligenceProvider {
  async createBrief(job: CareJob): Promise<SceneBrief> {
    return {
      refinedPrompt: `${job.prompt} Use calm editorial shapes, a restrained teal and terracotta palette, clear focal hierarchy, and no readable text.`,
      visualIntent: `A respectful ${job.audience.replaceAll("-", " ")} visual that helps a facilitator begin a conversation.`,
      preserve: ["primary composition", "recognizable subject", "breathing room"],
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

  async reviewImage(job: CareJob, _outputUrl: string, attempt: number): Promise<QaReview> {
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
    return {
      verdict: "pass",
      score: attempt === 1 ? 94 : 96,
      checks: [
        { label: "Brief alignment", passed: true, note: "Composition and intent match the approved brief." },
        { label: "Child-safe visual", passed: true, note: "No unsafe or identifying visual content detected." },
        { label: "Text integrity", passed: true, note: "No accidental lettering found." },
      ],
      agent: "visual-qa-agent",
    };
  }
}

export class DemoImageProvider implements ImageProvider {
  async submit(job: CareJob, _brief: SceneBrief, attempt: number) {
    const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
    return {
      requestId: `demo_${job.mode}_${suffix}`,
      immediateOutputUrl:
        job.mode === "inpaint" ? "/assets/carecanvas-inpaint-result.svg" : attempt > 1 ? "/assets/carecanvas-result-v2.svg" : "/assets/carecanvas-result.svg",
    };
  }
}
