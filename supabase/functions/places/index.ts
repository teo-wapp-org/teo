import { serviceClient, userClient } from "../_shared/supabase.ts";
import { createPlacesApp } from "./app.ts";

const app = createPlacesApp({
  db: serviceClient(),
  userDb: userClient,
  log: (event, data) => console.log(JSON.stringify({ fn: "places", event, ...data })),
});

Deno.serve(app.fetch);
