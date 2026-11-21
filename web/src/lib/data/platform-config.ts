import "server-only";
import { cache } from "react";
import { DEFAULT_PUBLIC_CONFIG, parsePublicConfig, type PublicPlatformConfig } from "@/lib/public-config";
import { createClient } from "@/lib/supabase/server";

export type { PublicPlatformConfig };

/** Una lectura por request. */
export const getPublicConfig = cache(async (): Promise<PublicPlatformConfig> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("public_platform_config");
  if (error) return DEFAULT_PUBLIC_CONFIG;
  return parsePublicConfig(data);
});
