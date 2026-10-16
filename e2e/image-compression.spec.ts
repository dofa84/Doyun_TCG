import { test, expect } from "@playwright/test";

test("큰 사진을 압축하여 D1 한도 안에 저장하고 손상 사진은 거부한다", async ({ page }) => {
  const signup = await page.request.post("/api/auth/register", {
    headers: { Origin: "http://127.0.0.1:8799" },
    data: { email: `image-${Date.now()}@example.test`, password: "Local-test-password-123" },
  });
  expect(signup.status()).toBe(201);
  expect((await page.request.post("/api/factions", { headers: { Origin: "http://127.0.0.1:8799" }, data: { name: `사진 진영 ${Date.now()}`, description: "" } })).status()).toBe(201);
  await page.goto("/");
  await page.getByRole("button", { name: "▤ 카드 도감" }).click();
  await page.getByRole("button", { name: "＋ 카드 만들기" }).click();
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1400; canvas.height = 1400;
    const ctx = canvas.getContext("2d")!;
    const pixels = ctx.createImageData(1400, 1400);
    let seed = 12345;
    for (let i = 0; i < pixels.data.length; i += 4) {
      for (let j = 0; j < 3; j++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        pixels.data[i + j] = seed >>> 24;
      }
      pixels.data[i + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  const buffer = Buffer.from(png, "base64");
  expect(buffer.length).toBeGreaterThan(512 * 1024);
  const uploaded = page.waitForResponse(r => r.url().includes("/api/uploads/card-image") && r.request().method() === "POST");
  await page.locator("input[type=file]").setInputFiles({ name: "large.png", mimeType: "image/png", buffer });
  expect((await uploaded).status()).toBe(201);
  const img = page.getByAltText("카드 이미지 미리보기");
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate(async (el: HTMLImageElement) => {
    await el.decode();
    return el.naturalWidth;
  })).toBeLessThanOrEqual(1200);
  const storedSize = await img.evaluate(async (el: HTMLImageElement) => (await (await fetch(el.src)).arrayBuffer()).byteLength);
  expect(storedSize).toBeLessThanOrEqual(512 * 1024);
  await page.locator("input[type=file]").setInputFiles({ name: "broken.png", mimeType: "image/png", buffer: Buffer.from("not-an-image") });
  await expect(page.getByRole("alert")).toBeVisible();
});
