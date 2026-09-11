import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "prod.spec.ts",
  timeout: 90_000,
  retries: 0,
  use: {
    baseURL: "https://demo.johnwehland.com",
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: false,
    launchOptions: {
      args: ["--use-gl=angle", "--use-angle=d3d11"],
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
