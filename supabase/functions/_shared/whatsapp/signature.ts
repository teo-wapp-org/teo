// Firma X-Hub-Signature-256 de Meta: HMAC SHA-256 del body crudo con el App Secret.

const encoder = new TextEncoder();

export async function hmacSha256Hex(secret: string, data: string | Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = typeof data === "string" ? encoder.encode(data) : data;
  const sig = await crypto.subtle.sign("HMAC", key, bytes as BufferSource);
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Comparación en tiempo constante (no corta en el primer byte distinto). */
export function timingSafeEqual(a: string, b: string): boolean {
  const ba = encoder.encode(a);
  const bb = encoder.encode(b);
  let diff = ba.length ^ bb.length;
  const len = Math.max(ba.length, bb.length);
  for (let i = 0; i < len; i++) diff |= (ba[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

export async function signBody(secret: string, rawBody: string | Uint8Array): Promise<string> {
  return `sha256=${await hmacSha256Hex(secret, rawBody)}`;
}

export async function verifySignature(rawBody: string | Uint8Array, header: string | null, secret: string): Promise<boolean> {
  if (!header || !secret) return false;
  const expected = await signBody(secret, rawBody);
  return timingSafeEqual(header.trim().toLowerCase(), expected);
}
