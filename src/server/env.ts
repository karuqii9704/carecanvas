import "server-only";

import { z } from "zod";

const optionalString = z.string().trim().min(1).optional();

const serverEnvSchema = z.object({
  CARECANVAS_MODE: z.enum(["demo", "live"]).default("demo"),
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  ANTHROPIC_API_KEY: optionalString,
  ANTHROPIC_MODEL: z.string().default("claude-haiku-4-5"),
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

let cached: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (!cached) cached = serverEnvSchema.parse(process.env);
  return cached;
}

export function resetEnvForTests(): void {
  cached = undefined;
}

export function isLiveConfigured(env = getServerEnv()): boolean {
  return Boolean(
    env.CARECANVAS_MODE === "live" &&
      env.ANTHROPIC_API_KEY &&
      env.FAL_KEY &&
      env.FAL_WEBHOOK_URL &&
      env.INNGEST_EVENT_KEY &&
      env.INNGEST_SIGNING_KEY &&
      env.NEXT_PUBLIC_SUPABASE_URL &&
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      env.SUPABASE_SERVICE_ROLE_KEY,
  );
}
