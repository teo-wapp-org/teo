import { serviceClient, userClient } from "../_shared/supabase.ts";
import { createConnectApp } from "./app.ts";

const app = createConnectApp({
  db: serviceClient(),
  userDb: userClient,
  log: (event, data) => console.log(JSON.stringify({ fn: "whatsapp-connect", event, ...data })),
});

Deno.serve(app.fetch);
