import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:8799",
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command:
      "npm run build && npx wrangler d1 migrations apply DB --local --persist-to .wrangler/e2e && npx wrangler dev --ip 127.0.0.1 --port 8799 --persist-to .wrangler/e2e",
    url: "http://127.0.0.1:8799/api/health",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
