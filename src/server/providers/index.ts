import "server-only";

import { getExecutionProfile, getServerEnv } from "@/server/env";
import { AnthropicIntelligenceProvider } from "@/server/providers/anthropic";
import type { PipelineProviders } from "@/server/providers/contracts";
import { DemoImageProvider, DemoIntelligenceProvider } from "@/server/providers/demo";
import { FalImageProvider } from "@/server/providers/fal";
import { GeminiIntelligenceProvider } from "@/server/providers/gemini";

export function getPipelineProviders(): PipelineProviders {
  const env = getServerEnv();
  const profile = getExecutionProfile(env);
  if (profile === "demo") {
    return { intelligence: new DemoIntelligenceProvider(), image: new DemoImageProvider() };
  }

  const intelligence =
    env.CARECANVAS_INTELLIGENCE_PROVIDER === "gemini"
      ? new GeminiIntelligenceProvider(env.GEMINI_API_KEY!, env.GEMINI_MODEL, { appUrl: env.NEXT_PUBLIC_APP_URL })
      : new AnthropicIntelligenceProvider(env.ANTHROPIC_API_KEY!, env.ANTHROPIC_MODEL);

  return {
    intelligence,
    image: profile === "live" ? new FalImageProvider(env.FAL_KEY!, env.FAL_WEBHOOK_URL!) : new DemoImageProvider(),
  };
}
