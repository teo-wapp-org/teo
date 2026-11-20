// Construye un payload real de Meta, lo firma (X-Hub-Signature-256) y lo envía al webhook. Ver scripts/wa-simulate.
import { fakeWamid, imageMessage, statusUpdate, textMessage, webhookPayload } from "../supabase/functions/_shared/whatsapp/fixtures.ts";
import { signBody } from "../supabase/functions/_shared/whatsapp/signature.ts";
import type { WebhookPayload } from "../supabase/functions/_shared/whatsapp/types.ts";

const url = Deno.env.get("WA_WEBHOOK_URL")!;
const secret = Deno.env.get("WA_APP_SECRET")!;

const args = [...Deno.args];
const flag = (name: string) => {
  const i = args.indexOf(name);
  if (i < 0) return false;
  args.splice(i, 1);
  return true;
};
const option = (name: string) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const badSignature = flag("--bad-signature");
const dryRun = flag("--dry-run");
const name = option("--name") ?? "Cliente Simulado";
const wamid = option("--wamid") ?? fakeWamid();
const [cmd, ...rest] = args;

function usage(): never {
  console.error("Uso: wa-simulate text|image|status|verify ... (ver scripts/wa-simulate)");
  Deno.exit(2);
}

if (cmd === "verify") {
  const challenge = String(Math.floor(Math.random() * 1e9));
  const token = encodeURIComponent(Deno.env.get("WA_VERIFY_TOKEN") ?? "");
  const res = await fetch(`${url}?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=${challenge}`);
  const body = await res.text();
  console.log(JSON.stringify({ status: res.status, challenge_ok: body === challenge }));
  Deno.exit(res.ok && body === challenge ? 0 : 1);
}

let payload: WebhookPayload;
if (cmd === "text") {
  const [phoneId, from, text] = rest;
  if (!phoneId || !from || !text) usage();
  payload = webhookPayload({ phoneNumberId: phoneId, contacts: [{ waId: from, name }], messages: [textMessage(from, text, wamid)] });
} else if (cmd === "image") {
  const [phoneId, from, mediaId, caption] = rest;
  if (!phoneId || !from || !mediaId) usage();
  payload = webhookPayload({ phoneNumberId: phoneId, contacts: [{ waId: from, name }], messages: [imageMessage(from, mediaId, caption, wamid)] });
} else if (cmd === "status") {
  const [phoneId, target, status, recipient] = rest;
  if (!phoneId || !target || !status) usage();
  const error = status === "failed" ? { code: 131026, title: "Message undeliverable" } : undefined;
  payload = webhookPayload({ phoneNumberId: phoneId, statuses: [statusUpdate(target, status, recipient ?? "593990000000", error)] });
} else {
  usage();
}

const body = JSON.stringify(payload);
if (dryRun) {
  console.log(body);
  Deno.exit(0);
}
const signature = badSignature ? "sha256=" + "0".repeat(64) : await signBody(secret, body);
const t0 = performance.now();
const res = await fetch(url, { method: "POST", body, headers: { "Content-Type": "application/json", "X-Hub-Signature-256": signature } });
console.log(JSON.stringify({
  status: res.status,
  ms: Math.round(performance.now() - t0),
  wamid: cmd === "status" ? rest[1] : wamid,
  response: await res.text(),
}));
