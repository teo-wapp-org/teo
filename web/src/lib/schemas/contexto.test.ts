import { describe, expect, it } from "vitest";
import { AgentSchema, BusinessSchema, InviteSchema, PaymentMethodSchema, paymentDetails, StoreSchema } from "./contexto";

describe("BusinessSchema", () => {
  const base = { name: "Café Ñandú", tone: "cercano", use_usted: "tu", faqs: "[]" };
  it("acepta lo mínimo y normaliza vacíos a null", () => {
    const r = BusinessSchema.parse({ ...base, description: "", instagram: "@cafe", use_emojis: "on" });
    expect(r.description).toBeNull();
    expect(r.instagram).toBe("cafe");
    expect(r.use_emojis).toBe(true);
    expect(r.use_usted).toBe(false);
    expect(r.faqs).toEqual([]);
  });
  it("valida FAQs y web", () => {
    expect(BusinessSchema.safeParse({ ...base, faqs: '[{"q":"","a":"x"}]' }).success).toBe(false);
    expect(BusinessSchema.safeParse({ ...base, faqs: "no-json" }).success).toBe(false);
    expect(BusinessSchema.safeParse({ ...base, website: "cafe.com" }).success).toBe(false);
    expect(BusinessSchema.parse({ ...base, website: "https://cafe.com", use_usted: "usted" }).use_usted).toBe(true);
  });
});

describe("PaymentMethodSchema", () => {
  it("transferencia exige banco, número y titular", () => {
    const r = PaymentMethodSchema.safeParse({ type: "transferencia", label: "Banco" });
    expect(r.success).toBe(false);
    const ok = PaymentMethodSchema.parse({ type: "transferencia", label: "Pichincha", banco: "Pichincha", numero: "2200", titular: "Ana", tipo_cuenta: "ahorros", url: "" });
    expect(paymentDetails(ok)).toEqual({ banco: "Pichincha", numero: "2200", titular: "Ana", tipo_cuenta: "ahorros" });
  });
  it("link exige url y solo guarda la url", () => {
    expect(PaymentMethodSchema.safeParse({ type: "link", label: "Payphone" }).success).toBe(false);
    const ok = PaymentMethodSchema.parse({ type: "link", label: "Payphone", url: "https://pay.me/x", banco: "X" });
    expect(paymentDetails(ok)).toEqual({ url: "https://pay.me/x" });
  });
});

describe("AgentSchema", () => {
  const base = { mode: "piloto", display_name: "Teo", business_hours: "{}", escalation_keywords: '["humano"]', payment_expiry_hours: "48" };
  it("parsea monto y palabras", () => {
    const r = AgentSchema.parse({ ...base, escalation_amount_usd: "150,5", enabled: "on" });
    expect(r.escalation_amount_usd).toBe(150.5);
    expect(r.escalation_keywords).toEqual(["humano"]);
    expect(r.enabled).toBe(true);
  });
  it("rechaza expiración fuera de rango", () => {
    expect(AgentSchema.safeParse({ ...base, payment_expiry_hours: "0" }).success).toBe(false);
    expect(AgentSchema.safeParse({ ...base, payment_expiry_hours: "721" }).success).toBe(false);
  });
});

describe("StoreSchema e InviteSchema", () => {
  it("tienda con horario", () => {
    const r = StoreSchema.parse({ name: "Matriz", hours: '{"lun":[{"open":"09:00","close":"18:00"}]}', active: "on", lat: "", lng: "" });
    expect(r.hours.lun).toHaveLength(1);
    expect(r.lat).toBeNull();
    expect(StoreSchema.safeParse({ name: "X", hours: '{"lun":[{"open":"18:00","close":"09:00"}]}' }).success).toBe(false);
  });
  it("invitación normaliza el correo", () => {
    expect(InviteSchema.parse({ email: " Ana@Mail.com ", role: "admin" }).email).toBe("ana@mail.com");
  });
});
