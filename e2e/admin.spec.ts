import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { validPng } from "./image-fixture";
test("가입부터 사진 카드 제작, 심사, 관리자 승인과 활성화", async ({
  page,
}) => {
  const email = "e2e-" + Date.now() + "@example.test";
  const factionName = "별빛 기사단 " + Date.now(),
    cardName = "새벽의 수호자 " + Date.now();
  await page.goto("/");
  await page.getByRole("button", { name: "처음 오셨나요? 회원가입" }).click();
  await page.getByLabel("이메일", { exact: true }).fill(email);
  await page
    .getByLabel("비밀번호", { exact: true })
    .fill("Local-test-password-123");
  await page.getByRole("button", { name: "계정 만들기 →" }).click();
  await expect(
    page.getByRole("heading", { name: "오늘은 어떤 영웅을 만들까요?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "⚑ 진영 관리" }).click();
  await page.getByRole("button", { name: "＋ 진영 만들기" }).click();
  await page.getByLabel("진영 이름", { exact: true }).fill(factionName);
  await page
    .getByLabel("진영 설명", { exact: true })
    .fill("도윤이의 첫 번째 카드 세계");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByRole("heading", { name: factionName })).toBeVisible();
  await page.getByRole("button", { name: "▤ 카드 도감" }).click();
  await page.getByRole("button", { name: "＋ 카드 만들기" }).click();
  await page.getByLabel("카드 이름", { exact: true }).fill(cardName);
  await page.getByLabel("HP", { exact: false }).fill("800");
  await page.getByLabel("공격력", { exact: false }).fill("120");
  await page
    .getByRole("combobox", { name: "등급", exact: true })
    .selectOption("hero");
  await page
    .getByRole("combobox", { name: "패시브", exact: true })
    .selectOption("armor");
  await page.locator("input[type=file]").setInputFiles({
    name: "star.png",
    mimeType: "image/png",
    buffer: await validPng(page),
  });
  await expect(page.getByAltText("카드 이미지 미리보기")).toBeVisible();
  await page.getByRole("button", { name: "카드 저장", exact: true }).click();
  await expect(page.getByRole("heading", { name: cardName })).toBeVisible();
  await page
    .getByRole("button")
    .filter({ has: page.getByRole("heading", { name: cardName }) })
    .click();
  await page.getByRole("button", { name: "심사 요청", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("심사 대기");
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  const promoted = spawnSync(
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
      "UPDATE users SET role='admin' WHERE email='" + email + "';",
    ],
    { encoding: "utf8" },
  );
  expect(promoted.status, promoted.stderr).toBe(0);
  await page.reload();
  await page.getByRole("button", { name: /검수 대기/ }).click();
  await page
    .getByRole("button")
    .filter({ has: page.getByRole("heading", { name: cardName }) })
    .click();
  await page.getByRole("button", { name: "승인", exact: true }).click();
  await page.getByRole("button", { name: "사용 활성화", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("사용 가능");
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await page.getByRole("button", { name: "▦ 작업실" }).click();
  await page.screenshot({
    path: "artifacts/admin-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "artifacts/admin-mobile.png", fullPage: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "카드 공방에 들어가기" }),
  ).toBeVisible();
  await page.getByLabel("아이디 또는 이메일", { exact: true }).fill(email);
  await page
    .getByLabel("비밀번호", { exact: true })
    .fill("Local-test-password-123");
  await page.getByRole("button", { name: "로그인 →", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "오늘은 어떤 영웅을 만들까요?" }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});
