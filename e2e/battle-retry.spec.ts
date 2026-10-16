import { test, expect } from "@playwright/test";
import { seedBattle, createAndJoin } from "./battle-fixture";
test("대기방 생성자 로그아웃·쿠키 소실 뒤 첫 계정 재인증과 두 번째 참가 복구", async ({
  page,
}) => {
  const seed = await seedBattle(page);
  await page.getByRole("button", { name: "⚔ 대전", exact: true }).click();
  await page.getByLabel("출전 진영", { exact: true }).selectOption(seed.id);
  await page
    .getByRole("button", { name: "대기방 만들기", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "두 번째 플레이어 참가" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await page.context().clearCookies();
  await page
    .getByLabel("아이디 또는 이메일", { exact: true })
    .fill(seed.users[0].email);
  await page
    .getByLabel("비밀번호", { exact: true })
    .fill(seed.users[0].password);
  await page.getByRole("button", { name: "로그인 →", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "대전 기기 다시 인증" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "이 계정 인증", exact: true }).click();
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
});
test("미확정 생성은 메뉴 이동·새로고침 후 같은 요청으로 복원", async ({
  page,
}) => {
  const seed = await seedBattle(page);
  let first = true,
    requestId = "",
    retryId = "";
  await page.route("**/api/games", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    if (first) {
      first = false;
      requestId = route.request().postDataJSON().request_id;
      await route.fetch();
      await route.abort("failed");
    } else {
      retryId = route.request().postDataJSON().request_id;
      await route.continue();
    }
  });
  await page.getByRole("button", { name: "⚔ 대전", exact: true }).click();
  await page.getByLabel("출전 진영", { exact: true }).selectOption(seed.id);
  await page
    .getByRole("button", { name: "대기방 만들기", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "같은 요청 다시 확인", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "카드 제작·관리로 이동", exact: true })
    .click();
  await page.getByRole("button", { name: "⚔ 대전", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "같은 요청 다시 확인", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "같은 요청 다시 확인", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "대기방 만들기", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "같은 요청 다시 확인", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "두 번째 플레이어 참가" }),
  ).toBeVisible();
  expect(retryId).toBe(requestId);
  expect(
    (await (await page.request.get("/api/games")).json()).games,
  ).toHaveLength(1);
});
test("로그아웃 뒤 원래 두 계정으로 기기 재인증하면 같은 게임 복원", async ({
  page,
}) => {
  const seed = await seedBattle(page),
    id = await createAndJoin(page, seed),
    before = await (await page.request.get(`/api/games/${id}`)).json();
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await page
    .getByLabel("아이디 또는 이메일", { exact: true })
    .fill(seed.users[0].email);
  await page
    .getByLabel("비밀번호", { exact: true })
    .fill(seed.users[0].password);
  await page.getByRole("button", { name: "로그인 →", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "대전 기기 다시 인증" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "이 계정 인증", exact: true }).click();
  await page.getByLabel("참가자 아이디 또는 이메일").fill(seed.users[1].email);
  await page.getByLabel("참가자 비밀번호").fill(seed.users[1].password);
  await page.getByRole("button", { name: "계정 전환", exact: true }).click();
  await page.getByRole("button", { name: "이 계정 인증", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "대전 중", exact: true }),
  ).toBeVisible();
  const after = await (await page.request.get(`/api/games/${id}`)).json();
  expect(after.view).toEqual(before.view);
  expect(after.version).toBe(1);
});
test("생성 뒤 서버 오류 응답도 같은 요청으로 재확인해 방 중복 생성 없음", async ({
  page,
}) => {
  const seed = await seedBattle(page);
  let first = true,
    firstId = "",
    retryId = "";
  await page.route("**/api/games", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const body = route.request().postDataJSON();
    if (first) {
      first = false;
      firstId = body.request_id;
      await route.fetch();
      return route.fulfill({
        status: 500,
        json: { error: "response-failed-after-save" },
      });
    }
    retryId = body.request_id;
    await route.continue();
  });
  await page.getByRole("button", { name: "⚔ 대전", exact: true }).click();
  await page.getByLabel("출전 진영", { exact: true }).selectOption(seed.id);
  await page
    .getByRole("button", { name: "대기방 만들기", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "같은 요청 다시 확인", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "같은 요청 다시 확인", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "두 번째 플레이어 참가" }),
  ).toBeVisible();
  expect(retryId).toBe(firstId);
  const list = await (await page.request.get("/api/games")).json();
  expect(list.games).toHaveLength(1);
});
test("참가 응답 유실 재시도는 동일 게임·덱·버전으로 복원", async ({ page }) => {
  const seed = await seedBattle(page);
  let first = true;
  const ids: string[] = [];
  await page.route("**/api/games/*/join", async (route) => {
    ids.push(route.request().postDataJSON().request_id);
    if (first) {
      first = false;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "⚔ 대전", exact: true }).click();
  await page.getByLabel("출전 진영", { exact: true }).selectOption(seed.id);
  await page
    .getByRole("button", { name: "대기방 만들기", exact: true })
    .click();
  await page.getByLabel("참가자 아이디 또는 이메일").fill(seed.users[1].email);
  await page.getByLabel("참가자 비밀번호").fill(seed.users[1].password);
  await page.getByRole("button", { name: "계정 전환", exact: true }).click();
  await page.getByLabel("출전 진영", { exact: true }).selectOption(seed.id);
  await page
    .getByRole("button", { name: "이 계정으로 참가", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "같은 요청 다시 확인", exact: true }),
  ).toBeVisible();
  const id = new URL(page.url()).searchParams.get("game"),
    before = await (await page.request.get(`/api/games/${id}`)).json();
  await page
    .getByRole("button", { name: "같은 요청 다시 확인", exact: true })
    .click();
  await expect(page.locator(".battle-board")).toHaveAttribute(
    "data-version",
    "1",
  );
  const after = await (await page.request.get(`/api/games/${id}`)).json();
  expect(after.view).toEqual(before.view);
  expect(ids[1]).toBe(ids[0]);
});
test("늦은 게임 조회 응답은 목록 화면으로 돌아간 뒤 전장을 덮지 않는다", async ({
  page,
}) => {
  const seed = await seedBattle(page),
    id = await createAndJoin(page, seed);
  let release: () => void = () => {};
  const barrier = new Promise<void>((r) => {
    release = r;
  });
  let arrived: () => void = () => {};
  const entered = new Promise<void>((r) => {
    arrived = r;
  });
  await page.route(`**/api/games/${id}`, async (route) => {
    const result = await route.fetch();
    arrived();
    await barrier;
    await route.fulfill({ response: result });
  });
  await page
    .getByRole("button", { name: "상태 새로고침", exact: true })
    .click();
  await entered;
  await page.getByRole("button", { name: "대전 목록", exact: true }).click();
  release();
  await expect(
    page.getByRole("heading", { name: "새 대전 준비" }),
  ).toBeVisible();
  await expect(page.locator(".battle-board")).toHaveCount(0);
});
test("서버가 적용한 공격 응답 유실은 같은 요청으로 재시도해 중복 피해 없음", async ({
  page,
}) => {
  const seed = await seedBattle(page),
    id = await createAndJoin(page, seed);
  let intercepted = false,
    firstId = "",
    retryId = "";
  await page.route(`**/api/games/${id}/actions`, async (route) => {
    const b = route.request().postDataJSON();
    if (!intercepted) {
      intercepted = true;
      firstId = b.request_id;
      await route.fetch();
      await route.abort("failed");
    } else {
      retryId = b.request_id;
      await route.continue();
    }
  });
  const before = await (await page.request.get(`/api/games/${id}`)).json();
  await page
    .getByRole("button", { name: "기기를 넘겼어요", exact: true })
    .click();
  await page.locator(".battle-actions button").first().click();
  await expect(
    page.getByRole("button", { name: "같은 요청 다시 확인", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "같은 요청 다시 확인", exact: true })
    .click();
  await expect(page.locator(".battle-board")).toHaveAttribute(
    "data-version",
    String(before.version + 1),
  );
  expect(retryId).toBe(firstId);
});
test("두 번째 로그인 실패는 참가·첫 계정 전환을 하지 않는다", async ({
  page,
}) => {
  const seed = await seedBattle(page);
  await page.getByRole("button", { name: "⚔ 대전", exact: true }).click();
  await page.getByLabel("출전 진영", { exact: true }).selectOption(seed.id);
  await page
    .getByRole("button", { name: "대기방 만들기", exact: true })
    .click();
  await page.getByLabel("참가자 아이디 또는 이메일").fill(seed.users[1].email);
  await page.getByLabel("참가자 비밀번호").fill("wrong-password");
  await page.getByRole("button", { name: "계정 전환", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  expect((await (await page.request.get("/api/auth/me")).json()).user.id).toBe(
    seed.users[0].id,
  );
  await expect(
    page.getByRole("heading", { name: "대전 중", exact: true }),
  ).toHaveCount(0);
});
