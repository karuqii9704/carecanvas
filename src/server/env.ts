import "server-only";

import { z } from "zod";

const optionalString = z.string().trim().min(1).optional();

const serverEnvSchema = z.object({
  CARECANVAS_MODE: z.enum(["demo", "harness", "live"]).default("demo"),
  CARECANVAS_INTELLIGENCE_PROVIDER: z.enum(["anthropic", "gemini"]).default("anthropic"),
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  ANTHROPIC_API_KEY: optionalString,
  ANTHROPIC_MODEL: z.string().default("claude-haiku-4-5"),
  GEMINI_API_KEY: optionalString,
  GEMINI_MODEL: z.string().default("gemini-3.5-flash"),
  FAL_KEY: optionalString,
  FAL_WEBHOOK_URL: z.url().optional(),
  INNGEST_EVENT_KEY: optionalString,
  INNGEST_SIGNING_KEY: optionalString,
  NEXT_PUBLIC_SUPABASE_URL: z.url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalString,
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
  CARECANVAS_DAILY_LIMIT: z.coerce.number().int().positive().default(1),
  CARECANVAS_LIFETIME_LIMIT: z.coerce.number().int().positive().default(50),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type ExecutionProfile = ServerEnv["CARECANVAS_MODE"];
export type IntelligenceProviderName = ServerEnv["CARECANVAS_INTELLIGENCE_PROVIDER"];

let cached: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (!cached) cached = serverEnvSchema.parse(process.env);
  return cached;
}

export function resetEnvForTests(): void {
  cached = undefined;
}

function assertIntelligenceConfigured(env: ServerEnv): void {
  if (env.CARECANVAS_INTELLIGENCE_PROVIDER === "gemini" && !env.GEMINI_API_KEY) {
    throw new Error("Gemini intelligence requires the server-only GEMINI_API_KEY environment variable.");
  }
  if (env.CARECANVAS_INTELLIGENCE_PROVIDER === "anthropic" && !env.ANTHROPIC_API_KEY) {
    throw new Error("Anthropic intelligence requires the server-only ANTHROPIC_API_KEY environment variable.");
  }
}

export function getExecutionProfile(env = getServerEnv()): ExecutionProfile {
  if (env.CARECANVAS_MODE === "demo") return "demo";
  assertIntelligenceConfigured(env);
  if (env.CARECANVAS_MODE === "harness") return "harness";

  const missing = [
    !env.FAL_KEY && "FAL_KEY",
    !env.FAL_WEBHOOK_URL && "FAL_WEBHOOK_URL",
    !env.INNGEST_EVENT_KEY && "INNGEST_EVENT_KEY",
    !env.INNGEST_SIGNING_KEY && "INNGEST_SIGNING_KEY",
    !env.NEXT_PUBLIC_SUPABASE_URL && "NEXT_PUBLIC_SUPABASE_URL",
    !env.NEXT_PUBLIC_SUPABASE_ANON_KEY && "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    !env.SUPABASE_SERVICE_ROLE_KEY && "SUPABASE_SERVICE_ROLE_KEY",
  ].filter(Boolean) as string[];

  if (missing.length > 0) {
    throw new Error(`Durable live mode is missing required server configuration: ${missing.join(", ")}.`);
  }
  return "live";
}

export function isHarnessConfigured(env = getServerEnv()): boolean {
  try {
    return getExecutionProfile(env) === "harness";
  } catch {
    return false;
  }
}

export function isLiveConfigured(env = getServerEnv()): boolean {
  try {
    return getExecutionProfile(env) === "live";
  } catch {
    return false;
  }
}

export function usesExternalIntelligence(env = getServerEnv()): boolean {
  const profile = getExecutionProfile(env);
  return profile === "harness" || profile === "live";
}
