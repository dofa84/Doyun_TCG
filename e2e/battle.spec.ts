import { test, expect } from "@playwright/test";
import { seedBattle, createAndJoin, origin } from "./battle-fixture";
test("두 계정 모바일 교대 대전·새로고침·승패와 각 계정 결과 조회", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 390, height: 844 });
  const seed = await seedBattle(page),
    id = await createAndJoin(page, seed);
  const contrast = await page
    .locator(".battle-player h3")
    .first()
    .evaluate((el) => {
      const luminance = (rgb: string) => {
        const c = (rgb.match(/[\d.]+/g) ?? [])
          .slice(0, 3)
          .map(Number)
          .map((x) => {
            const n = x / 255;
            return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
          });
        return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
      };
      const a = luminance(getComputedStyle(el).color),
        b = luminance(getComputedStyle(el.parentElement!).backgroundColor);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
  let ended = false;
  for (let i = 0; i < 90; i++) {
    const current = await (await page.request.get(`/api/games/${id}`)).json();
    if (current.status === "finished") {
      ended = true;
      break;
    }
    const handoff = page.getByRole("button", {
      name: "기기를 넘겼어요",
      exact: true,
    });
    if (await handoff.isVisible()) await handoff.click();
    const normal = page.getByRole("button", { name: /일반 공격/ });
    const defend = page.getByRole("button", { name: /카드로 받기/ });
    const open = page.getByRole("button", { name: /^(카드 오픈|오픈 →)/ });
    const chosen = (await defend.count())
      ? defend.first()
      : (await normal.count())
        ? normal.first()
        : open.first();
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith(`/games/${id}/actions`) &&
        r.request().method() === "POST",
    );
    await chosen.click();
    expect((await response).status()).toBe(200);
    await expect(page.locator(".battle-board")).toHaveAttribute(
      "data-version",
      String(current.version + 1),
    );
    if (i === 1) {
      await page.reload();
      await expect(page.locator(".battle-board")).toHaveAttribute(
        "data-version",
        String(current.version + 1),
      );
    }
  }
  expect(ended).toBe(true);
  await expect(
    page.getByRole("heading", { name: "대전 결과", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/battle-mobile.png",
    fullPage: true,
  });
  const two = await (await page.request.get("/api/games")).json();
  expect(
    two.games.some((g: any) => g.id === id && g.status === "finished"),
  ).toBe(true);
  await page.request.post("/api/auth/login", {
    headers: { Origin: origin },
    data: { email: seed.users[0].email, password: seed.users[0].password },
  });
  const one = await (await page.request.get("/api/games")).json();
  expect(one.games.find((g: any) => g.id === id)?.winner).toBe(
    two.games.find((g: any) => g.id === id)?.winner,
  );
});
