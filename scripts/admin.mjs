import { spawnSync } from "node:child_process";
const email = process.argv[2];
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("사용법: npm run admin:local -- user@example.com");
  process.exit(1);
}
const sql =
  "UPDATE users SET role='admin' WHERE email='" +
  email.replaceAll("'", "''") +
  "'; SELECT id,email,role FROM users WHERE email='" +
  email.replaceAll("'", "''") +
  "';";
const r = spawnSync(
  "npx",
  ["wrangler", "d1", "execute", "DB", "--local", "--command", sql],
  { stdio: "inherit" },
);
process.exit(r.status ?? 1);
