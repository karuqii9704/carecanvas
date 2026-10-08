import { describe, expect, it } from "vitest";

import { deriveSceneSpec, parseSceneSlug, renderSceneSvg, sceneSubjects, sceneUrl } from "@/domain/scene";
import { loadGeminiImage } from "@/server/providers/gemini-runtime";

const job = (prompt: string, mode: "img2img" | "inpaint" = "img2img", simulateFirstQaFailure = false) => ({ prompt, mode, simulateFirstQaFailure });

describe("deterministic illustrator", () => {
  it("reads subject, held object, setting, palette, and mood from the direction", () => {
    expect(deriveSceneSpec(job("A happy fox reading a book in a sunny garden"), 1)).toEqual({
      subject: "fox",
      object: "book",
      setting: "garden",
      palette: "sunny",
      mood: "happy",
      mode: "img2img",
      variant: "clean",
    });
  });

  it("prefers the longer phrase and the person's own words", () => {
    expect(deriveSceneSpec(job("A calm red panda holding a card"), 1).subject).toBe("red-panda");
    const spec = deriveSceneSpec({ ...job("A calm friend holding a card"), sceneBrief: { refinedPrompt: "A fox and an owl" } }, 1);
    expect(spec.subject).toBe("fox");
    const own = deriveSceneSpec({ ...job("A calm owl holding a card"), sceneBrief: { refinedPrompt: "A fox" } }, 1);
    expect(own.subject).toBe("owl");
  });

  it("understands Indonesian directions", () => {
    expect(deriveSceneSpec(job("Seekor kucing yang tenang memegang bunga di hutan"), 1)).toMatchObject({
      subject: "cat",
      object: "flower",
      setting: "forest",
      mood: "calm",
    });
  });

  it("matches whole words only", () => {
    const spec = deriveSceneSpec(job("Start with a catalogue of calm shapes"), 1);
    expect(spec.subject).toBe("friend");
    expect(spec.object).toBe("none");
  });

  it("keeps the source room and palette when inpainting", () => {
    expect(deriveSceneSpec(job("A blue owl on the beach", "inpaint"), 1)).toMatchObject({
      subject: "owl",
      setting: "reading-nook",
      palette: "warm",
      mode: "inpaint",
    });
  });

  it("draws the reliability-drill defect on attempt one only", () => {
    expect(deriveSceneSpec(job("A calm cat", "img2img", true), 1).variant).toBe("micro-text");
    expect(deriveSceneSpec(job("A calm cat", "img2img", true), 2).variant).toBe("clean");
  });

  it("round-trips through its URL and rejects anything outside the vocabulary", () => {
    const spec = deriveSceneSpec(job("A sleepy owl holding a star at night"), 1);
    expect(parseSceneSlug(sceneUrl(spec))).toEqual(spec);
    expect(parseSceneSlug("/api/scene/owl~star~night~warm~sleepy~img2img~clean.svg")).not.toBeNull();
    expect(parseSceneSlug("/api/scene/<script>~star~night~warm~sleepy~img2img~clean.svg")).toBeNull();
    expect(parseSceneSlug("owl~star")).toBeNull();
  });

  it("renders every subject as well-formed SVG with no text elements", () => {
    for (const subject of sceneSubjects) {
      const svg = renderSceneSvg({ ...deriveSceneSpec(job("A calm friend"), 1), subject });
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg).not.toMatch(/<text|undefined|NaN/);
    }
  });

  it("rasterizes rendered scenes for vision QA without a network request", async () => {
    const image = await loadGeminiImage(sceneUrl(deriveSceneSpec(job("A happy frog holding a book"), 1)));
    expect(image.mimeType).toBe("image/png");
    expect(image.data.length).toBeGreaterThan(1000);
  });
});
