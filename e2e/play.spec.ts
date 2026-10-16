import { test, expect } from "@playwright/test";
import { seedBattle, origin } from "./battle-fixture";

test("/play는 모바일 전용 로그인과 진영 선택을 제공한다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/play");
  await expect(
    page.getByRole("heading", { name: "대전 시작하기", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("내 카드와 진영을 관리하는 공간입니다."),
  ).toHaveCount(0);
  const seed = await seedBattle(page);
  await page.request.post("/api/auth/logout", {
    headers: { Origin: origin },
    data: {},
  });
  await page.goto("/play");
  await page
    .getByLabel("아이디 또는 이메일", { exact: true })
    .fill(seed.users[0].email);
  await page
    .getByLabel("비밀번호", { exact: true })
    .fill(seed.users[0].password);
  await page.getByRole("button", { name: "로그인 →", exact: true }).click();
  await expect(page.getByLabel("출전 진영", { exact: true })).toBeVisible();
  await expect(page.locator(".sidebar")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "＋ 카드 만들기", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("출전 진영", { exact: true }).selectOption(seed.id);
  await page
    .getByRole("button", { name: "대기방 만들기", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "두 번째 플레이어 참가" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "두 번째 플레이어 참가" }),
  ).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/play");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
