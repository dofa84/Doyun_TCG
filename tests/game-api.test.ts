import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
import { gameFixture } from "./game-fixtures";
import { gameView } from "../src/game/view";
let f: Awaited<ReturnType<typeof gameFixture>>;
beforeAll(async () => {
  f = await gameFixture();
}, 60000);
beforeEach(async () => {
  await f.db.prepare("DELETE FROM auth_attempts").run();
});
afterAll(async () => {
  await f?.mf.dispose();
});
const rid = () => crypto.randomUUID();
it("동일 참가 요청이 동시에 도착해도 양쪽 모두 같은 시작 결과를 받는다", async () => {
  const g = await lobby(),
    two = await login(1),
    b = { faction_id: "f1", request_id: rid(), expected_version: 0 };
  const rs = await Promise.all(
    [0, 1].map(() =>
      f.request(`/games/${g.id}/join`, "POST", b, two + "; " + g.device),
    ),
  );
  expect(rs.map((r) => r.status)).toEqual([200, 200]);
  expect(rs[0].data.view).toEqual(rs[1].data.view);
});
async function login(n: number) {
  return (
    await f.request("/auth/login", "POST", {
      email: f.users[n].email,
      password: "Test-password-123",
    })
  ).cookie;
}
async function lobby() {
  const one = await login(0);
  const r = await f.request(
    "/games",
    "POST",
    { faction_id: "f1", request_id: rid() },
    one,
  );
  expect(r.status).toBe(201);
  return { id: r.data.id, one, device: r.cookie };
}
async function start() {
  const g = await lobby(),
    two = await login(1);
  const r = await f.request(
    `/games/${g.id}/join`,
    "POST",
    { faction_id: "f1", request_id: rid(), expected_version: 0 },
    two + "; " + g.device,
  );
  expect(r.status).toBe(200);
  return { ...g, two, cookie: two + "; " + g.device, data: r.data };
}
it("서로 다른 두 계정 확인 후 시작하며 현재 일반 계정은 두 번째 계정", async () => {
  const g = await start();
  expect(g.data.status).toBe("active");
  expect(g.data.members.map((m: any) => m.user_id)).toEqual([
    f.users[0].id,
    f.users[1].id,
  ]);
  expect(g.data.device_ready).toBe(true);
  expect(
    (await f.request("/auth/me", "GET", undefined, g.cookie)).data.user.id,
  ).toBe(f.users[1].id);
  expect((await f.request("/auth/me", "GET", undefined, g.device)).status).toBe(
    401,
  );
});
it("자기 계정·기기 권한 없는 참가·타인 관리자 조회를 차단", async () => {
  const g = await lobby(),
    path = `/games/${g.id}`;
  expect(
    (
      await f.request(
        path + "/join",
        "POST",
        { faction_id: "f1", request_id: rid(), expected_version: 0 },
        g.one + "; " + g.device,
      )
    ).status,
  ).toBe(409);
  const two = await login(1);
  expect(
    (
      await f.request(
        path + "/join",
        "POST",
        { faction_id: "f1", request_id: rid(), expected_version: 0 },
        two,
      )
    ).status,
  ).toBe(403);
  expect(
    (await f.request(path, "GET", undefined, f.users[2].cookie)).status,
  ).toBe(404);
});
it("게임 참가 재시도는 버전과 덱을 변경하지 않는다", async () => {
  const g = await lobby(),
    two = await login(1),
    cookie = two + "; " + g.device,
    b = { faction_id: "f1", request_id: rid(), expected_version: 0 };
  const a = await f.request(`/games/${g.id}/join`, "POST", b, cookie),
    d = await f.request(`/games/${g.id}/join`, "POST", b, cookie);
  expect(a.status).toBe(200);
  expect(d.status).toBe(200);
  expect(d.data.view).toEqual(a.data.view);
  expect(d.data.version).toBe(1);
});
it("행동은 두 계정 기기 권한 필요, 재시도는 한 번만 적용하고 비공개 덱은 숨긴다", async () => {
  const g = await start(),
    view = g.data.view;
  const action = view.legal_actions[0].action;
  const b = {
    request_id: rid(),
    expected_version: 1,
    actor_seat: view.actor_seat,
    action,
  };
  expect(
    (await f.request(`/games/${g.id}/actions`, "POST", b, g.two)).status,
  ).toBe(403);
  const a = await f.request(`/games/${g.id}/actions`, "POST", b, g.cookie),
    d = await f.request(`/games/${g.id}/actions`, "POST", b, g.cookie);
  expect(a.status).toBe(200);
  expect(d.data.version).toBe(a.data.version);
  expect(d.data.view.players[0].deck).toBeUndefined();
  expect(d.data.state_json).toBeUndefined();
  expect(
    (await f.request(`/games/${g.id}/events`, "GET", undefined, g.cookie)).data
      .events.length,
  ).toBeGreaterThan(0);
  expect(
    (
      await f.request(
        `/games/${g.id}/events`,
        "GET",
        undefined,
        f.users[2].cookie,
      )
    ).status,
  ).toBe(404);
});
it("로그아웃 후 대전 권한 무효화, 두 원래 계정 재인증으로 복구", async () => {
  const g = await start();
  await f.request("/auth/logout", "POST", {}, g.two);
  const one = await login(0),
    path = `/games/${g.id}`;
  expect(
    (await f.request(path, "GET", undefined, one + "; " + g.device)).data
      .device_ready,
  ).toBe(false);
  const b = {
    request_id: rid(),
    expected_version: 1,
    actor_seat: g.data.view.actor_seat,
    action: g.data.view.legal_actions[0].action,
  };
  expect(
    (await f.request(path + "/actions", "POST", b, one + "; " + g.device))
      .status,
  ).toBe(403);
  const first = await f.request(
    path + "/device-authorizations",
    "POST",
    {},
    one + "; " + g.device,
  );
  expect(first.data.device_ready).toBe(false);
  const two = await login(1);
  const second = await f.request(
    path + "/device-authorizations",
    "POST",
    {},
    two + "; " + g.device,
  );
  expect(second.data.device_ready).toBe(true);
});
it("원래 세션 만료·계정 정지는 대전 행동을 막는다", async () => {
  const g = await start();
  await f.db
    .prepare("UPDATE users SET status='suspended' WHERE id=?")
    .bind(f.users[0].id)
    .run();
  const v = g.data.view,
    b = {
      request_id: rid(),
      expected_version: 1,
      actor_seat: v.actor_seat,
      action: v.legal_actions[0].action,
    };
  expect(
    (await f.request(`/games/${g.id}/actions`, "POST", b, g.cookie)).status,
  ).toBe(403);
  await f.db
    .prepare("UPDATE users SET status='active' WHERE id=?")
    .bind(f.users[0].id)
    .run();
  await f.db
    .prepare("UPDATE sessions SET expires_at=0 WHERE user_id=?")
    .bind(f.users[0].id)
    .run();
  expect(
    (await f.request(`/games/${g.id}/actions`, "POST", b, g.cookie)).status,
  ).toBe(403);
});
it("수비 선택 대기 복원 및 동시 행동은 한 번만 반영", async () => {
  const g = await start();
  const record = await f.db
    .prepare("SELECT state_json FROM games WHERE id=?")
    .bind(g.id)
    .first<{ state_json: string }>();
  const s = JSON.parse(record!.state_json);
  const take = (p: any) => {
    const at = p.deck.findIndex((c: any) => !c.is_exodia);
    return p.deck.splice(at, 1)[0];
  };
  for (const p of s.players) {
    if (!p.slots.attack) p.slots.attack = take(p);
    p.slots.defense = take(p);
  }
  s.active_seat = 0;
  await f.db
    .prepare("UPDATE games SET state_json=? WHERE id=?")
    .bind(JSON.stringify(s), g.id)
    .run();
  const b = {
    request_id: rid(),
    expected_version: 1,
    actor_seat: 0,
    action: { type: "attack", slot: "attack", special: false },
  };
  const a = await f.request(`/games/${g.id}/actions`, "POST", b, g.cookie);
  expect(a.data.view.pending_attack).not.toBeNull();
  const restored = await f.request(
    `/games/${g.id}`,
    "GET",
    undefined,
    g.cookie,
  );
  expect(restored.data.view).toEqual(a.data.view);
  const rs = await Promise.all(
    [0, 1].map(() =>
      f.request(
        `/games/${g.id}/actions`,
        "POST",
        {
          request_id: rid(),
          expected_version: 2,
          actor_seat: 1,
          action: { type: "defend", slot: "defense" },
        },
        g.cookie,
      ),
    ),
  );
  expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
});
it("원본 이미지 교체·보관 뒤에도 참가자는 스냅샷 사진을 보고 삭제는 차단", async () => {
  const g = await start();
  await f.db
    .prepare(
      "INSERT INTO uploads(key,owner_user_id,mime) VALUES('new-photo',?,'image/png')",
    )
    .bind(f.users[0].id)
    .run();
  await f.db
    .prepare("UPDATE cards SET is_usable=0,archived=1,image_key='new-photo'")
    .run();
  expect(
    (
      await f.mf.dispatchFetch("http://localhost/api/images/game-photo", {
        headers: { Cookie: g.two },
      })
    ).status,
  ).toBe(200);
  await f.db
    .prepare("UPDATE users SET role='user' WHERE id=?")
    .bind(f.users[2].id)
    .run();
  expect(
    (
      await f.mf.dispatchFetch("http://localhost/api/images/game-photo", {
        headers: { Cookie: f.users[2].cookie },
      })
    ).status,
  ).toBe(403);
  expect(
    (await f.request("/uploads/card-image/game-photo", "DELETE", {}, g.one))
      .status,
  ).toBe(409);
  await f.db
    .prepare("UPDATE cards SET archived=0,is_usable=1,image_key='game-photo'")
    .run();
  await f.db
    .prepare("UPDATE users SET role='admin' WHERE id=?")
    .bind(f.users[2].id)
    .run();
});
it("불正 형식·종료 게임 행동·페이지 제한 검증", async () => {
  const g = await start();
  expect(
    (await f.request(`/games/${g.id}/actions`, "POST", null, g.cookie)).status,
  ).toBe(400);
  const s = g.data.view;
  await f.db
    .prepare("UPDATE games SET status='finished' WHERE id=?")
    .bind(g.id)
    .run();
  expect(
    (
      await f.request(
        `/games/${g.id}/actions`,
        "POST",
        {
          request_id: rid(),
          expected_version: 1,
          actor_seat: s.actor_seat,
          action: s.legal_actions[0].action,
        },
        g.cookie,
      )
    ).status,
  ).toBe(409);
  const list = await f.request("/games?limit=9999", "GET", undefined, g.two);
  expect(list.data.games.length).toBeLessThanOrEqual(50);
});
