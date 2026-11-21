import { platformAgentDeps } from "../_shared/agent/runtime.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { createRunnerApp } from "./app.ts";

const app = createRunnerApp({
  agent: platformAgentDeps(serviceClient(), (event, data) => console.log(JSON.stringify({ fn: "agent-runner", event, ...data }))),
  secret: Deno.env.get("TEO_CRON_SECRET"),
});

Deno.serve(app.fetch);
