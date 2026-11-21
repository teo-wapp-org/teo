import { describe, expect, it } from "vitest";
import {
  AiSettingSchema,
  BrandingSettingSchema,
  MetaSettingSchema,
  normalizeConfig,
  planFormInput,
  PlanSchema,
  SecretValueSchema,
  SignupSettingSchema,
  SubscriptionSchema,
  TeamMemberSchema,
  toDateInput,
} from "./admin";

const ai = { enabled: "on", provider: "fake", agent_model: "claude-opus-5-5", cheap_model: "claude-haiku-5-5", effort: "low", max_tool_iterations: "6", timeout_s: "45", debounce_seconds: "4" };

describe("ajustes", () => {
  it("IA: convierte segundos a ms y valida rangos", () => {
    const r = AiSettingSchema.parse(ai);
    expect(r).toMatchObject({ enabled: true, provider: "fake", timeout_ms: 45000, max_tool_iterations: 6, debounce_seconds: 4 });
    expect(r).not.toHaveProperty("timeout_s");
    expect(AiSettingSchema.parse({ ...ai, enabled: undefined }).enabled).toBe(false);
    expect(AiSettingSchema.safeParse({ ...ai, max_tool_iterations: "50" }).success).toBe(false);
    expect(AiSettingSchema.safeParse({ ...ai, max_tool_iterations: "2.5" }).success).toBe(false);
    expect(AiSettingSchema.safeParse({ ...ai, provider: "openai" }).success).toBe(false);
    expect(AiSettingSchema.safeParse({ ...ai, agent_model: "mi modelo" }).success).toBe(false);
  });

  it("Meta: ids numéricos opcionales y versión vNN.N", () => {
    expect(MetaSettingSchema.parse({ app_id: "", es_config_id: "123456", graph_version: "v24.0" })).toEqual({
      app_id: null,
      es_config_id: "123456",
      graph_version: "v24.0",
      manual_connection_enabled: false,
    });
    expect(MetaSettingSchema.safeParse({ app_id: "abc", graph_version: "v24.0" }).success).toBe(false);
    expect(MetaSettingSchema.safeParse({ graph_version: "24" }).success).toBe(false);
  });

  it("Registro y marca", () => {
    expect(SignupSettingSchema.parse({ enabled: "on", trial_plan: "negocio", trial_days: "0" })).toEqual({
      enabled: true,
      require_email_confirmation: false,
      trial_plan: "negocio",
      trial_days: 0,
    });
    expect(SignupSettingSchema.safeParse({ trial_plan: "negocio", trial_days: "200" }).success).toBe(false);
    expect(BrandingSettingSchema.parse({ support_email: " Hola@Teo.EC " })).toEqual({ support_email: "hola@teo.ec" });
    expect(BrandingSettingSchema.safeParse({ support_email: "nope" }).success).toBe(false);
  });

  it("secretos: mínimo 8 caracteres y nombre conocido", () => {
    expect(SecretValueSchema.safeParse({ name: "resend_api_key", value: "re_1234567" }).success).toBe(true);
    expect(SecretValueSchema.safeParse({ name: "resend_api_key", value: "corto" }).success).toBe(false);
    expect(SecretValueSchema.safeParse({ name: "otro", value: "123456789" }).success).toBe(false);
  });

  it("normalizeConfig completa con valores por defecto", () => {
    const c = normalizeConfig({ settings: { ai: { provider: "anthropic" } }, secrets: { resend_api_key: { last4: "abcd", updated_at: "2026-11-20T00:00:00Z", updated_by: null } } });
    expect(c.settings.ai.provider).toBe("anthropic");
    expect(c.settings.ai.max_tool_iterations).toBe(6);
    expect(c.settings.signup.trial_days).toBe(14);
    expect(c.secrets.resend_api_key?.last4).toBe("abcd");
    expect(c.secrets.anthropic_api_key).toBeNull();
    expect(normalizeConfig(null).settings.meta.graph_version).toBe("v24.0");
  });
});

describe("planes", () => {
  const fd = () => {
    const f = new FormData();
    Object.entries({ mode: "update", id: "pro", name: "Pro", price_usd_month: "99,5", teo_messages_month: "6000", max_users: "", max_stores: "3", max_products: "", sort_order: "4", active: "on" }).forEach(([k, v]) => f.append(k, v));
    f.append("features", "kanban");
    f.append("features", "chat");
    f.append("features", "no_existe");
    return f;
  };

  it("vacío = ilimitado, coma decimal y features conocidas", () => {
    const r = PlanSchema.parse(planFormInput(fd()));
    expect(r).toMatchObject({ id: "pro", price_usd_month: 99.5, max_users: null, max_stores: 3, max_products: null, features: ["kanban", "chat"], active: true, highlighted: false });
  });

  it("rechaza identificadores y precios inválidos", () => {
    expect(PlanSchema.safeParse({ ...planFormInput(fd()), id: "Plan Pro" }).success).toBe(false);
    expect(PlanSchema.safeParse({ ...planFormInput(fd()), price_usd_month: "-1" }).success).toBe(false);
    expect(PlanSchema.safeParse({ ...planFormInput(fd()), max_users: "1.5" }).success).toBe(false);
  });
});

describe("comercios y equipo", () => {
  const id = "6f1c1d1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f";
  it("suscripción: fechas al fin del día en Ecuador y prueba con fecha", () => {
    const r = SubscriptionSchema.parse({ orgId: id, plan: "pro", status: "trial", trial_ends_at: "2026-12-31", period_end: "" });
    expect(r.trial_ends_at).toBe("2026-12-31T23:59:59-05:00");
    expect(r.period_end).toBeNull();
    expect(SubscriptionSchema.safeParse({ orgId: id, plan: "pro", status: "trial" }).success).toBe(false);
    expect(SubscriptionSchema.safeParse({ orgId: id, plan: "pro", status: "active" }).success).toBe(true);
  });

  it("toDateInput usa la zona de Ecuador", () => {
    expect(toDateInput("2027-01-01T03:00:00Z")).toBe("2026-12-31");
    expect(toDateInput(null)).toBe("");
  });

  it("equipo: correo en minúsculas y rol válido", () => {
    expect(TeamMemberSchema.parse({ email: " Ana@Teo.EC ", role: "soporte" })).toEqual({ email: "ana@teo.ec", role: "soporte" });
    expect(TeamMemberSchema.safeParse({ email: "ana", role: "soporte" }).success).toBe(false);
    expect(TeamMemberSchema.safeParse({ email: "ana@teo.ec", role: "owner" }).success).toBe(false);
  });
});
