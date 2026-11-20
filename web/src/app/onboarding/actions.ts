"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type OnboardingState = { error?: string };

const Schema = z.object({
  name: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres").max(120),
  rubro: z.string().trim().max(60).optional(),
});

export async function createOrganization(_: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const parsed = Schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_organization", { p_name: parsed.data.name, p_rubro: parsed.data.rubro ?? null });
  if (error || !data) return { error: "No pudimos crear tu comercio. Inténtalo de nuevo." };
  redirect(`/app/${(data as { slug: string }).slug}`);
}
