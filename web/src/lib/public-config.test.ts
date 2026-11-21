import { describe, expect, it } from "vitest";
import { DEFAULT_PUBLIC_CONFIG, parsePublicConfig } from "./public-config";

describe("public_platform_config → PublicPlatformConfig", () => {
  it("toma los valores de la DB", () => {
    expect(
      parsePublicConfig({
        signup_enabled: false,
        trial_days: 30,
        meta_app_id: "123",
        meta_es_config_id: "456",
        meta_graph_version: "v25.0",
        whatsapp_manual_connection: false,
        places_available: true,
        support_email: "hola@teo.app",
      }),
    ).toEqual({
      signup_enabled: false,
      trial_days: 30,
      meta_app_id: "123",
      meta_es_config_id: "456",
      meta_graph_version: "v25.0",
      whatsapp_manual_connection: false,
      places_available: true,
      support_email: "hola@teo.app",
    });
  });

  it("usa valores por defecto ante datos ausentes o inválidos", () => {
    expect(parsePublicConfig(null)).toEqual(DEFAULT_PUBLIC_CONFIG);
    const c = parsePublicConfig({ trial_days: -3, meta_app_id: "  ", signup_enabled: "no" });
    expect(c.trial_days).toBe(14);
    expect(c.meta_app_id).toBeNull();
    expect(c.signup_enabled).toBe(true);
    expect(c.places_available).toBe(false);
  });
});
