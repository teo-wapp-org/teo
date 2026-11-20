import { defineConfig, devices } from "@playwright/test";

/**
 * E2E contra el Supabase de desarrollo (teo-dev). Ejecutar con ../scripts/e2e
 * - E2E_BASE_URL definido → prueba ese despliegue (p. ej. producción o un preview).
 * - Sin E2E_BASE_URL → levanta `next start` local (requiere `npm run build`).
 */
const external = process.env.E2E_BASE_URL;
const port = Number(process.env.E2E_PORT ?? 3123); // cada agente/worktree usa su propio puerto

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e-report" }]],
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    baseURL: external ?? `http://localhost:${port}`,
    locale: "es-EC",
    timezoneId: "America/Guayaquil",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /public\.spec\.ts/ },
  ],
  webServer: external
    ? undefined
    : { command: `npm run start -- -p ${port}`, url: `http://localhost:${port}`, reuseExistingServer: true, timeout: 60_000 },
});
