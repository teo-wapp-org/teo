import { assert, assertEquals, assertFalse } from "jsr:@std/assert@1";
import { hmacSha256Hex, signBody, timingSafeEqual, verifySignature } from "./signature.ts";

Deno.test("hmac coincide con un vector conocido (RFC 4231 caso 2)", async () => {
  assertEquals(
    await hmacSha256Hex("Jefe", "what do ya want for nothing?"),
    "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
  );
});

Deno.test("firma válida se acepta", async () => {
  const body = JSON.stringify({ hola: "mundo" });
  assert(await verifySignature(body, await signBody("s3cr3t", body), "s3cr3t"));
});

Deno.test("firma inválida, ausente, de otro secreto o de otro body se rechaza", async () => {
  const body = '{"a":1}';
  assertFalse(await verifySignature(body, null, "s3cr3t"));
  assertFalse(await verifySignature(body, "sha256=deadbeef", "s3cr3t"));
  assertFalse(await verifySignature(body, await signBody("otro", body), "s3cr3t"));
  assertFalse(await verifySignature('{"a":2}', await signBody("s3cr3t", body), "s3cr3t"));
  assertFalse(await verifySignature(body, "sha256=00", ""));
});

Deno.test("timingSafeEqual", () => {
  assert(timingSafeEqual("abc", "abc"));
  assertFalse(timingSafeEqual("abc", "abd"));
  assertFalse(timingSafeEqual("abc", "abcd"));
  assertFalse(timingSafeEqual("", "a"));
});
