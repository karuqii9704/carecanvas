import { describe, expect, it } from "vitest";

import {
  getExecutionProfile,
  isHarnessConfigured,
  isLiveConfigured,
  type ServerEnv,
  usesExternalIntelligence,
} from "@/server/env";

const baseEnv: ServerEnv = {
  CARECANVAS_MODE: "demo",
  CARECANVAS_INTELLIGENCE_PROVIDER: "anthropic",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  ANTHROPIC_MODEL: "claude-test-model",
  GEMINI_MODEL: "gemini-test-model",
  CARECANVAS_DAILY_LIMIT: 1,
  CARECANVAS_LIFETIME_LIMIT: 50,
};

describe("CareCanvas Gemini execution profiles", () => {
  it("keeps demo mode deterministic without requiring any external provider key", () => {
    const env: ServerEnv = {
      ...baseEnv,
      CARECANVAS_MODE: "demo",
      CARECANVAS_INTELLIGENCE_PROVIDER: "gemini",
    };

    expect(getExecutionProfile(env)).toBe("demo");
    expect(usesExternalIntelligence(env)).toBe(false);
  });

  it("requires the selected Gemini key before enabling the harness", () => {
    const env: ServerEnv = {
      ...baseEnv,
      CARECANVAS_MODE: "harness",
      CARECANVAS_INTELLIGENCE_PROVIDER: "gemini",
      ANTHROPIC_API_KEY: "anthropic-does-not-satisfy-gemini",
    };

    expect(() => getExecutionProfile(env)).toThrow(/server-only GEMINI_API_KEY/);
    expect(isHarnessConfigured(env)).toBe(false);
  });

  it("runs Gemini harness mode without requiring the durable live stack", () => {
    const env: ServerEnv = {
      ...baseEnv,
      CARECANVAS_MODE: "harness",
      CARECANVAS_INTELLIGENCE_PROVIDER: "gemini",
      GEMINI_API_KEY: "test-only-gemini-key",
    };

    expect(getExecutionProfile(env)).toBe("harness");
    expect(isHarnessConfigured(env)).toBe(true);
    expect(isLiveConfigured(env)).toBe(false);
    expect(usesExternalIntelligence(env)).toBe(true);
  });

  it("does not mistake a keyed harness for durable live mode", () => {
    const env: ServerEnv = {
      ...baseEnv,
      CARECANVAS_MODE: "live",
      CARECANVAS_INTELLIGENCE_PROVIDER: "gemini",
      GEMINI_API_KEY: "test-only-gemini-key",
    };

    expect(() => getExecutionProfile(env)).toThrow(/Durable live mode is missing required server configuration/);
    expect(isLiveConfigured(env)).toBe(false);
  });

  it("accepts Gemini live mode only when the durable stack is complete", () => {
    const env: ServerEnv = {
      ...baseEnv,
      CARECANVAS_MODE: "live",
      CARECANVAS_INTELLIGENCE_PROVIDER: "gemini",
      GEMINI_API_KEY: "test-only-gemini-key",
      FAL_KEY: "test-only-fal-key",
      FAL_WEBHOOK_URL: "https://example.test/api/fal/webhook",
      INNGEST_EVENT_KEY: "test-only-inngest-event-key",
      INNGEST_SIGNING_KEY: "test-only-inngest-signing-key",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-only-supabase-anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "test-only-supabase-service-key",
    };

    expect(getExecutionProfile(env)).toBe("live");
    expect(isLiveConfigured(env)).toBe(true);
    expect(usesExternalIntelligence(env)).toBe(true);
  });
});
