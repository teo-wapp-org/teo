import { describe, expect, it } from "vitest";
import { auditActionLabel, auditTargetLabel, describeAuditMetadata, randomToken, translateAdminError } from "./labels";

describe("translateAdminError", () => {
  it("traduce los códigos de las RPC del admin", () => {
    expect(translateAdminError({ message: "anthropic_key_missing" })).toBe("Primero guarda la API key de Anthropic.");
    expect(translateAdminError({ message: "unknown_setting foo" })).toBe("Ese ajuste no existe.");
    expect(translateAdminError("last_superadmin")).toMatch(/al menos un superadmin/);
    expect(translateAdminError("cannot_remove_self")).toMatch(/a ti mismo/);
    expect(translateAdminError("not_found")).toMatch(/primero se registre/);
    expect(translateAdminError({ message: "invalid_trial_plan" })).toMatch(/plan de prueba/);
  });
  it("usa el código de Postgres y el mensaje por defecto", () => {
    expect(translateAdminError({ message: "duplicate key", code: "23505" })).toMatch(/Ya existe/);
    expect(translateAdminError({ message: "new row violates rls", code: "42501" })).toMatch(/superadmin/);
    expect(translateAdminError({ message: "otra cosa" }, "Falló")).toBe("Falló");
    expect(translateAdminError(null)).toMatch(/No pudimos guardar/);
  });
});

describe("auditoría", () => {
  it("traduce acciones y objetivos", () => {
    expect(auditActionLabel("org.set_status")).toBe("Cambió el estado del comercio");
    expect(auditActionLabel("x.desconocida")).toBe("x.desconocida");
    expect(auditTargetLabel("platform.setting", "ai")).toBe("Inteligencia artificial");
    expect(auditTargetLabel("platform.secret_set", "resend_api_key")).toBe("API key de Resend");
    expect(auditTargetLabel("platform.plan_update", "pro")).toBe("Plan pro");
    expect(auditTargetLabel("org.reset_usage", null)).toBe("—");
  });

  it("con before/after lista solo lo que cambió", () => {
    const changes = describeAuditMetadata({
      before: { enabled: true, effort: "low", updated_at: "a" },
      after: { enabled: false, effort: "low", updated_at: "b", features: ["kanban", "chat"] },
    });
    expect(changes).toEqual([
      { key: "enabled", before: "Sí", after: "No" },
      { key: "features", before: "—", after: "kanban, chat" },
    ]);
  });

  it("sin before (alta) no muestra valor anterior; metadata plano se lista tal cual", () => {
    expect(describeAuditMetadata({ before: null, after: { id: "x" } })).toEqual([{ key: "id", before: undefined, after: "x" }]);
    expect(describeAuditMetadata({ status: "suspendido" })).toEqual([{ key: "status", after: "suspendido" }]);
    expect(describeAuditMetadata(null)).toEqual([]);
  });
});

describe("randomToken", () => {
  it("genera tokens base64url largos y distintos", () => {
    const a = randomToken();
    const b = randomToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });
});
