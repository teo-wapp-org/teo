import { serviceClient, userClient } from "../_shared/supabase.ts";
import { createAdminOpsApp } from "./app.ts";

const app = createAdminOpsApp({
  db: serviceClient(),
  userDb: userClient,
  supabaseUrl: Deno.env.get("SUPABASE_URL"),
  log: (event, data) => console.log(JSON.stringify({ fn: "admin-ops", event, ...data })),
});

Deno.serve(app.fetch);
