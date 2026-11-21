import { platformAgentDeps } from "../_shared/agent/runtime.ts";
import { serviceClient, userClient } from "../_shared/supabase.ts";
import { createAgentApp } from "./app.ts";

const app = createAgentApp({
  agent: platformAgentDeps(serviceClient(), (event, data) => console.log(JSON.stringify({ fn: "agent", event, ...data }))),
  userDb: userClient,
});

Deno.serve(app.fetch);
