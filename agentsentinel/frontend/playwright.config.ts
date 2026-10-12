import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {
    baseURL:
      process.env.SENTINEL_UI_URL ||
      `http://127.0.0.1:${process.env.SENTINEL_UI_PORT || "5174"}`,
    headless: true,
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
  },
  reporter: "list",
});
