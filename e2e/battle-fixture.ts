import { expect, type Page } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { validPng } from "./image-fixture";
export const origin = "http://127.0.0.1:8799";
export async function seedBattle(page: Page) {
  const id = "battle-" + Date.now() + "-" + Math.floor(Math.random() * 1e6),
    password = "Local-test-password-123",
    users = [];
  for (const n of [1, 2]) {
    const email = `${id}-${n}@example.test`;
    const r = await page.request.post("/api/auth/register", {
      headers: { Origin: origin },
      data: { email, password },
    });
    expect(r.status()).toBe(201);
    users.push({ ...(await r.json()).user, email, password });
  }
  const photo = (await validPng(page)).toString("hex");
  const sql = [
    "DELETE FROM auth_attempts",
    `INSERT INTO factions(id,owner_user_id,name) VALUES('${id}','${users[0].id}','${id}')`,
    `INSERT INTO uploads(key,owner_user_id,mime) VALUES('${id}','${users[0].id}','image/png')`,
    `INSERT INTO image_data(key,data) VALUES('${id}',X'${photo}')`,
    ...Array.from(
      { length: 20 },
      (_, i) =>
        `INSERT INTO cards(id,faction_id,owner_user_id,name,rarity,hp,attack,image_key,is_exodia,review_status,is_usable) VALUES('${id}-${i}','${id}','${users[0].id}','${id}-card${i}','common',100,250,'${id}',${i < 5 ? 1 : 0},'approved',1)`,
    ),
  ].join(";");
  const seeded = spawnSync(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      "DB",
      "--local",
      "--persist-to",
      ".wrangler/e2e",
      "--command",
      sql,
    ],
    { encoding: "utf8" },
  );
  expect(seeded.status, seeded.stderr).toBe(0);
  await page.request.post("/api/auth/login", {
    headers: { Origin: origin },
    data: { email: users[0].email, password },
  });
  await page.goto("/");
  return { id, users };
}
export async function createAndJoin(
  page: Page,
  seed: Awaited<ReturnType<typeof seedBattle>>,
) {
  await page.getByRole("button", { name: "⚔ 대전", exact: true }).click();
  await page.getByLabel("출전 진영", { exact: true }).selectOption(seed.id);
  await page
    .getByRole("button", { name: "대기방 만들기", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "두 번째 플레이어 참가" }),
  ).toBeVisible();
  await page.getByLabel("참가자 아이디 또는 이메일").fill(seed.users[1].email);
  await page.getByLabel("참가자 비밀번호").fill(seed.users[1].password);
  await page.getByRole("button", { name: "계정 전환", exact: true }).click();
  await page.getByLabel("출전 진영", { exact: true }).selectOption(seed.id);
  await page
    .getByRole("button", { name: "이 계정으로 참가", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "대전 중", exact: true }),
  ).toBeVisible();
  return new URL(page.url()).searchParams.get("game")!;
}
