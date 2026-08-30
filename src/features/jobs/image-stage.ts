export type ExecutionProfile = "demo" | "harness" | "live";

export type ImageStageCopy = {
  /** Overlay chip on the image. */
  label: string;
  /** Shown under the image when the picture needs a boundary stated. */
  note: string | null;
};

/**
 * The preview panel is headed "Output review" but falls back to the source
 * illustration until generation has run, and outside `live` the image is fixed
 * bundled artwork that cannot depict whatever subject the direction asks for.
 * Both cases need saying at the image, not only in the README, or a reader
 * takes the character-free source for a failed generation.
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
    label: "BUNDLED STAND-IN",
    note: "The agent pipeline above ran for real, but this demo ships fixed artwork instead of calling an image provider — so the picture will not show the subject you asked for.",
  };
}
