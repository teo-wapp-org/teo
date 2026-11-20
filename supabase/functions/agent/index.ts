import { selectProvider } from "../_shared/llm/provider.ts";
import { serviceClient, userClient } from "../_shared/supabase.ts";
import { createAgentApp } from "./app.ts";

const app = createAgentApp({
  agent: {
    db: serviceClient(),
    llm: selectProvider(),
    now: () => new Date(),
    log: (event, data) => console.log(JSON.stringify({ fn: "agent", event, ...data })),
  },
  userDb: userClient,
});

Deno.serve(app.fetch);
