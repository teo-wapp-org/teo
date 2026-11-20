"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const Schema = z.object({ orgId: z.uuid(), status: z.enum(["activo", "suspendido", "onboarding"]) });

export async function setOrgStatus(formData: FormData) {
  const role = await requirePlatformAdmin();
  if (role !== "superadmin") throw new Error("forbidden");
  const { orgId, status } = Schema.parse(Object.fromEntries(formData));
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_org_status", { p_org: orgId, p_status: status });
  if (error) throw error;
  revalidatePath("/admin");
}
