import { cleanupQa } from "./supabase-admin";

export default async function globalTeardown() {
  await cleanupQa();
}
