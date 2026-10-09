import { defineConfig, devices } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { acceptanceEnvironment } from "./tests/support/environment";

const env = {
  ...process.env,
  ...acceptanceEnvironment,
  AUTH_REDIS_PREFIX: `nf:p00:browser:${randomUUID()}:`,
};
const artifactDirectory =
  process.env.P00_ARTIFACT_DIR || "./artifacts/acceptance/P00";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "p00-auth.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45000,
  expect: { timeout: 10000 },
  outputDir: `${artifactDirectory}/browser`,
  reporter: [
    ["list"],
    ["junit", { outputFile: `${artifactDirectory}/browser-junit.xml` }],
  ],
  use: {
    baseURL: acceptanceEnvironment.P00_UI_URL,
    locale: "zh-CN",
    trace: "off",
    video: "off",
    screenshot: "off",
  },
  projects: [{ name: "chromium-auth", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "pnpm --dir backend-node start",
      url: `${acceptanceEnvironment.P00_API_URL}/health`,
      env,
      reuseExistingServer: false,
      timeout: 120000,
    },
    {
      command: "pnpm --dir front dev --host 127.0.0.1 --port 5175 --strictPort",
      url: acceptanceEnvironment.P00_UI_URL,
      env,
      reuseExistingServer: false,
      timeout: 120000,
    },
  ],
});
