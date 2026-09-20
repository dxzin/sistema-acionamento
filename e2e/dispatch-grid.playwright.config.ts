import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

export default defineConfig({
  testDir: ".", testMatch: "dispatch-grid-identity.spec.ts", workers: 1,
  use: { baseURL: "http://127.0.0.1:3197", headless: true },
  webServer: { command: "node e2e/fixtures/dispatch-grid-server.mjs", cwd: resolve(__dirname, ".."), url: "http://127.0.0.1:3197", reuseExistingServer: false },
});
