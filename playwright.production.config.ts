import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.MILLOIN_PRODUCTION_URL?.replace(/\/$/, "");
if (!baseURL) throw new Error("MILLOIN_PRODUCTION_URL is required");

export default defineConfig({
  testDir: "./e2e-production",
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL,
    locale: "fi-FI",
    trace: "retain-on-failure",
  },
  projects: [{ name: "production-mobile", use: { ...devices["Pixel 7"] } }],
});
