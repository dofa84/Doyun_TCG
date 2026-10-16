import { test, expect, type Page } from "@playwright/test";
import { validPng } from "./image-fixture";
const faction = {
  id: "f",
  name: "진영",
  owner_user_id: "a",
  description: "",
  readiness: { total: 0, exodia: 0, normal: 0, ready: false },
};
const card = (id: string, name: string) => ({
  id,
  name,
  owner_user_id: "a",
  faction_id: "f",
  faction_name: "진영",
  rarity: "common",
  hp: 100,
  attack: 20,
  image_key: "img",
  is_exodia: 0,
  passive_code: null,
  special_attack_code: null,
  review_status: "pending",
  rejection_reason: null,
  is_usable: 0,
  version: 1,
});
async function setup(page: Page, role = "admin") {
  const state = {
    user: { id: "a", email: "a@example.test", role },
    failRefresh: false,
    creates: 0,
    delayApprove: false,
    release: () => {},
  };
  await page.route("**/api/**", async (route) => {
    const u = new URL(route.request().url()),
      p = u.pathname,
      method = route.request().method();
    const send = (data: unknown, status = 200) =>
      route.fulfill({ status, json: data });
    if (p === "/api/auth/me") return send({ user: state.user });
    if (p === "/api/auth/logout") return send({ ok: true });
    if (p === "/api/auth/login") {
      state.user = { id: "b", email: "b@example.test", role: "user" };
      state.failRefresh = true;
      return send({ user: state.user });
    }
    if (p === "/api/factions") return send([faction]);
    if (p === "/api/cards" && method === "GET")
      return state.failRefresh
        ? send({ error: "목록 새로고침 실패" }, 500)
        : send([card("a", "A의 비공개 카드"), card("b", "두 번째 카드")]);
    if (p === "/api/cards" && method === "POST") {
      state.creates++;
      state.failRefresh = true;
      return send({ id: "created" }, 201);
    }
    if (p === "/api/uploads/card-image") return send({ key: "img" }, 201);
    if (p.endsWith("/approve")) {
      if (state.delayApprove)
        await new Promise<void>((resolve) => {
          state.release = resolve;
        });
      return send({ ok: true });
    }
    if (p.endsWith("/audit")) return send([]);
    if (p === "/api/cards/a")
      return send({
        ...card("a", "A의 비공개 카드"),
        review_status: "approved",
        version: 2,
      });
    if (p.startsWith("/api/images/"))
      return route.fulfill({
        contentType: "image/png",
        body: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRZkAAAAASUVORK5CYII=",
          "base64",
        ),
      });
    return send({ error: "not found" }, 404);
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A의 비공개 카드" }),
  ).toBeVisible();
  return state;
}
test("계정 전환 후 목록 요청이 실패해도 이전 비공개 카드는 표시하지 않는다", async ({
  page,
}) => {
  await setup(page, "user");
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await page
    .getByLabel("아이디 또는 이메일", { exact: true })
    .fill("b@example.test");
  await page
    .getByLabel("비밀번호", { exact: true })
    .fill("Local-test-password-123");
  await page.getByRole("button", { name: "로그인 →", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "오늘은 어떤 영웅을 만들까요?" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "A의 비공개 카드" }),
  ).toHaveCount(0);
});
test("늦게 도착한 승인 결과가 새로 연 카드 상세를 덮지 않는다", async ({
  page,
}) => {
  const state = await setup(page);
  state.delayApprove = true;
  await page
    .getByRole("button")
    .filter({ has: page.getByRole("heading", { name: "A의 비공개 카드" }) })
    .click();
  await page.getByRole("button", { name: "승인", exact: true }).click();
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await page
    .getByRole("button")
    .filter({ has: page.getByRole("heading", { name: "두 번째 카드" }) })
    .click();
  await expect(page.getByRole("dialog")).toContainText("두 번째 카드");
  const refreshed = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/api/cards" &&
      r.request().method() === "GET",
  );
  state.release();
  await refreshed;
  await expect(page.getByRole("dialog")).toContainText("두 번째 카드");
});
test("저장 성공 후 목록 갱신이 실패해도 동일한 카드를 다시 생성하지 않는다", async ({
  page,
}) => {
  const state = await setup(page);
  await page.getByRole("button", { name: "＋ 카드 만들기" }).click();
  await page.getByLabel("카드 이름", { exact: true }).fill("새로운 카드");
  await page.locator("input[type=file]").setInputFiles({
    name: "x.png",
    mimeType: "image/png",
    buffer: await validPng(page),
  });
  await expect(page.getByAltText("카드 이미지 미리보기")).toBeVisible();
  await page.getByRole("button", { name: "카드 저장", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "카드 편집" })).toHaveCount(0);
  expect(state.creates).toBe(1);
  await expect(page.getByRole("alert")).toContainText("목록 새로고침 실패");
});
