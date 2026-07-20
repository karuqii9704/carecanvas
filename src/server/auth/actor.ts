import "server-only";

import { createClient } from "@supabase/supabase-js";

import { DEMO_OWNER_ID } from "@/domain/demo-data";
import { getServerEnv, isLiveConfigured } from "@/server/env";

export type RequestActor = { id: string; mode: "demo" | "authenticated" };

export async function getRequestActor(request: Request): Promise<RequestActor | null> {
  const env = getServerEnv();
  if (!isLiveConfigured(env)) return { id: DEMO_OWNER_ID, mode: "demo" };

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;

  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, mode: "authenticated" };
}
