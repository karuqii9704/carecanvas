import "server-only";

import { getServerEnv, isLiveConfigured } from "@/server/env";
import { AnthropicIntelligenceProvider } from "@/server/providers/anthropic";
import type { PipelineProviders } from "@/server/providers/contracts";
import { DemoImageProvider, DemoIntelligenceProvider } from "@/server/providers/demo";
import { FalImageProvider } from "@/server/providers/fal";

export function getPipelineProviders(): PipelineProviders {
  const env = getServerEnv();
  if (!isLiveConfigured(env)) {
    return { intelligence: new DemoIntelligenceProvider(), image: new DemoImageProvider() };
  }
  return {
    intelligence: new AnthropicIntelligenceProvider(env.ANTHROPIC_API_KEY!, env.ANTHROPIC_MODEL),
    image: new FalImageProvider(env.FAL_KEY!, env.FAL_WEBHOOK_URL!),
  };
}
