import type { CareJob, QaReview, SafetyReview, SceneBrief } from "@/domain/job";

export interface IntelligenceProvider {
  createBrief(job: CareJob): Promise<SceneBrief>;
  reviewSafety(job: CareJob, brief: SceneBrief): Promise<SafetyReview>;
  reviewImage(job: CareJob, outputUrl: string, attempt: number): Promise<QaReview>;
}

export type GenerationSubmission = {
  requestId: string;
  immediateOutputUrl?: string;
};

export interface ImageProvider {
  submit(job: CareJob, brief: SceneBrief, attempt: number): Promise<GenerationSubmission>;
}

export type PipelineProviders = {
  intelligence: IntelligenceProvider;
  image: ImageProvider;
};
