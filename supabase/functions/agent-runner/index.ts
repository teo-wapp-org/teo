import { selectProvider } from "../_shared/llm/provider.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { createRunnerApp } from "./app.ts";

const app = createRunnerApp({
  agent: {
    db: serviceClient(),
    llm: selectProvider(),
    now: () => new Date(),
    log: (event, data) => console.log(JSON.stringify({ fn: "agent-runner", event, ...data })),
  },
  secret: Deno.env.get("TEO_CRON_SECRET"),
});

Deno.serve(app.fetch);
