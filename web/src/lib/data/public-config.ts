import "server-only";
import { createClient } from "@/lib/supabase/server";

export type PublicConfig = {
  signup_enabled: boolean;
  trial_days: number;
  support_email: string | null;
};

const FALLBACK: PublicConfig = { signup_enabled: true, trial_days: 14, support_email: null };

/** Ajustes no sensibles de la plataforma (public_platform_config). Si falla, valores por defecto. */
export async function getPublicConfig(): Promise<PublicConfig> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("public_platform_config");
    if (error || !data || typeof data !== "object") return FALLBACK;
    const d = data as Record<string, unknown>;
    return {
      signup_enabled: d.signup_enabled !== false,
      trial_days: typeof d.trial_days === "number" ? d.trial_days : FALLBACK.trial_days,
      support_email: typeof d.support_email === "string" ? d.support_email : null,
    };
  } catch {
    return FALLBACK;
  }
}
