export type ExecutionProfile = "demo" | "harness" | "live";

export type ImageStageCopy = {
  /** Overlay chip on the image. */
  label: string;
  /** Shown under the image when the picture needs a boundary stated. */
  note: string | null;
};

/**
 * The preview panel is headed "Output review" but falls back to the source
 * illustration until generation has run, and outside `live` the picture comes
 * from a deterministic local illustrator rather than an image model. Both
 * cases need saying at the image, not only in the README, or a reader takes
 * the character-free source for a failed generation.
 */
export function describeImageStage(profile: ExecutionProfile, hasOutput: boolean): ImageStageCopy {
  if (!hasOutput) {
    return {
      label: "SOURCE · NOT GENERATED YET",
      note: "This is the input illustration, not a result. The image stage runs only after a person approves the brief.",
    };
  }

  if (profile === "live") {
    return { label: "RELEASE CANDIDATE", note: null };
  }

  return {
    label: "LOCAL RENDER",
    note: "Drawn from your direction by a deterministic flat-vector illustrator — no paid image model. Live mode swaps in fal.ai Flux for the same approved brief.",
  };
}
