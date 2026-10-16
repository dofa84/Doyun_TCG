import { beforeAll, afterAll, it, expect } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { build } from "esbuild";
import { readFileSync, readdirSync } from "node:fs";
import { makeAdmin } from "../scripts/bootstrap-admin.mjs";
let mf: Miniflare,
  db: D1Database,
  ownerCookie: string,
  otherCookie: string,
  adminCookie: string,
  faction: string,
  image: string,
  cardId: string;
async function req(
  path: string,
  method = "GET",
  body?: unknown,
  cookie = ownerCookie,
) {
  const request = new Request("http://localhost/api" + path, {
    method,
    headers: {
      Origin: "http://localhost",
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
    },
    body:
      body instanceof FormData
        ? body
        : body === undefined
          ? undefined
          : JSON.stringify(body),
  });
  const r = await mf.dispatchFetch(request.url, {
    method,
    headers: Object.fromEntries(request.headers),
    body:
      body === undefined
        ? undefined
        : new Uint8Array(await request.arrayBuffer()),
  });
  return {
    status: r.status,
    data: (await r.json()) as any,
    cookie: r.headers.get("set-cookie")?.split(";")[0],
  };
}
beforeAll(async () => {
  const out = await build({
    entryPoints: ["worker/index.ts"],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
  });
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: out.outputFiles[0].text,
      compatibilityDate: "2026-10-01",
      d1Databases: ["DB"],
      r2Buckets: ["IMAGES"],
    }),
  );
  db = (await mf.getD1Database("DB")) as unknown as D1Database;
  for (const filename of readdirSync("db/migrations")
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    await db.exec(
      readFileSync("db/migrations/" + filename, "utf8").replace(/\n/g, " "),
    );
  }
  for (const email of [
    "owner@example.test",
    "other@example.test",
    "admin@example.test",
  ]) {
    const r = await req(
      "/auth/register",
      "POST",
      { email, password: "Test-password-123", role: "admin" },
      "",
    );
    expect(r.status).toBe(201);
    expect(r.data.user.role).toBe("user");
    if (email.startsWith("owner")) ownerCookie = r.cookie!;
    else if (email.startsWith("other")) otherCookie = r.cookie!;
    else adminCookie = r.cookie!;
  }
  await db
    .prepare("UPDATE users SET role='admin' WHERE email=?")
    .bind("admin@example.test")
    .run();
  faction = (
    await req("/factions", "POST", { name: "화염 진영", description: "테스트" })
  ).data.id;
  const f = new FormData();
  f.set(
    "file",
    new File(
      [
        Uint8Array.from([
          137,
          80,
          78,
          71,
          13,
          10,
          26,
          10,
          ...new Array(20).fill(0),
        ]),
      ],
      "card.png",
      { type: "image/png" },
    ),
  );
  const uploaded = await req("/uploads/card-image", "POST", f);
  expect(uploaded.status, JSON.stringify(uploaded.data)).toBe(201);
  image = uploaded.data.key;
}, 60000);
afterAll(async () => {
  await mf?.dispose();
});
const card = (extra = {}) => ({
  name: "불꽃 기사",
  faction_id: faction,
  rarity: "rare",
  hp: 100,
  attack: 20,
  image_key: image,
  is_exodia: false,
  passive_code: null,
  special_attack_code: null,
  ...extra,
});
it("회원가입으로 관리자 권한을 얻을 수 없고 로그인 비밀번호를 검증한다", async () => {
  expect((await req("/auth/me")).data.user.role).toBe("user");
  expect(
    (
      await req(
        "/auth/login",
        "POST",
        { email: "owner@example.test", password: "wrong" },
        "",
      )
    ).status,
  ).toBe(401);
  const r = await req(
    "/auth/login",
    "POST",
    { email: "owner@example.test", password: "Test-password-123" },
    "",
  );
  expect(r.status).toBe(200);
  expect(r.cookie).toContain("tcg_session=");
  expect(
    (await req("/auth/me", "GET", undefined, "tcg_session=forged")).status,
  ).toBe(401);
});
it("운영 명령으로 만든 관리자 아이디로 로그인할 수 있다", async () => {
  const admin = makeAdmin({
    login: "administrator",
    password: "test-short",
    remote: false,
  });
  await db
    .prepare(
      "INSERT INTO users(id,email,login_name,password_hash,role) VALUES(?,?,?,?,'admin')",
    )
    .bind(admin.id, admin.email, admin.login_name, admin.password_hash)
    .run();
  const r = await req(
    "/auth/login",
    "POST",
    { email: "administrator", password: "test-short" },
    "",
  );
  expect(r.status).toBe(200);
  expect(r.data.user.role).toBe("admin");
});
it("비밀번호 해시는 사용자 응답에 노출되지 않는다", async () => {
  expect(JSON.stringify((await req("/auth/me")).data)).not.toContain(
    "password",
  );
});
it("다른 사용자 카드 수정과 관리자 작업을 차단한다", async () => {
  const created = await req("/cards", "POST", card());
  expect(created.status).toBe(201);
  cardId = created.data.id;
  expect(
    (await req("/cards/" + cardId, "PATCH", card({ version: 1 }), otherCookie))
      .status,
  ).toBe(403);
  expect(
    (await req("/admin/cards/" + cardId + "/approve", "POST", {})).status,
  ).toBe(403);
});
it("심사 제출 → 승인 → 활성화 → 수정 시 재심사와 비활성화", async () => {
  expect(
    (await req("/cards/" + cardId + "/submit", "POST", { version: 1 })).status,
  ).toBe(200);
  expect(
    (
      await req(
        "/admin/cards/" + cardId + "/approve",
        "POST",
        { version: 2 },
        adminCookie,
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await req(
        "/admin/cards/" + cardId + "/enable",
        "POST",
        { version: 3 },
        adminCookie,
      )
    ).status,
  ).toBe(200);
  expect((await req("/cards/" + cardId)).data.is_usable).toBe(1);
  expect(
    (
      await req(
        "/cards/" + cardId,
        "PATCH",
        card({ name: "수정 기사", version: 4 }),
      )
    ).status,
  ).toBe(200);
  const r = await req("/cards/" + cardId);
  expect(r.data.review_status).toBe("pending");
  expect(r.data.is_usable).toBe(0);
  expect(
    (
      await req(
        "/admin/cards/" + cardId + "/enable",
        "POST",
        { version: 5 },
        adminCookie,
      )
    ).status,
  ).toBe(409);
  expect(
    (await req("/cards/" + cardId + "/audit")).data.length,
  ).toBeGreaterThanOrEqual(5);
});
it("오래된 버전 저장을 거부한다", async () =>
  expect(
    (await req("/cards/" + cardId, "PATCH", card({ version: 1 }))).status,
  ).toBe(409));
it("진영마다 엑조디아 여섯 번째 생성을 차단한다", async () => {
  for (let i = 0; i < 5; i++)
    expect(
      (await req("/cards", "POST", card({ name: "조각" + i, is_exodia: true })))
        .status,
    ).toBe(201);
  expect(
    (await req("/cards", "POST", card({ name: "여섯째", is_exodia: true })))
      .status,
  ).toBe(409);
});
it("동시 엑조디아 요청도 최대 5장을 보장한다", async () => {
  const id = (
    await req("/factions", "POST", { name: "동시성 진영", description: "" })
  ).data.id;
  const results = await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      req(
        "/cards",
        "POST",
        card({ name: "조각" + i, faction_id: id, is_exodia: true }),
      ),
    ),
  );
  expect(results.filter((x) => x.status === 201)).toHaveLength(5);
  expect(results.filter((x) => x.status === 409)).toHaveLength(3);
});
it("이미지 소유권과 파일 내용 검증", async () => {
  expect((await req("/cards", "POST", card(), otherCookie)).status).toBe(403);
  const f = new FormData();
  f.set(
    "file",
    new File(["<script>bad</script>"], "x.png", { type: "image/png" }),
  );
  expect((await req("/uploads/card-image", "POST", f)).status).toBe(400);
  expect(
    (
      await req(
        "/images/" + encodeURIComponent(image),
        "GET",
        undefined,
        otherCookie,
      )
    ).status,
  ).toBe(403);
});
it("진영 준비는 승인 및 활성 카드만 집계한다", async () => {
  const fs = (await req("/factions")).data;
  expect(fs.find((x: any) => x.id === faction).readiness.ready).toBe(false);
  expect(fs.find((x: any) => x.id === faction).readiness.total).toBe(0);
  const detail = await req("/factions/" + faction);
  expect(detail.status).toBe(200);
  expect(detail.data.readiness.ready).toBe(false);
});
it("교차 출처 쓰기 및 미인증 요청 거부", async () => {
  const r = await mf.dispatchFetch("http://localhost/api/factions", {
    method: "POST",
    headers: {
      Origin: "https://evil.example",
      Cookie: ownerCookie,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  expect(r.status).toBe(403);
  expect((await req("/cards", "GET", undefined, "")).status).toBe(401);
});
it("승인·활성 20장과 엑조디아 5장 준비 조건을 API에서 검증한다", async () => {
  const f = (
    await req("/factions", "POST", { name: "출전 진영", description: "" })
  ).data.id;
  for (let i = 0; i < 20; i++) {
    await db
      .prepare(
        "INSERT INTO cards(id,owner_user_id,faction_id,name,rarity,hp,attack,image_key,is_exodia,review_status,is_usable) SELECT ?,id,?,?,'common',100,10,?,?,'approved',1 FROM users WHERE email='owner@example.test'",
      )
      .bind(crypto.randomUUID(), f, "카드" + i, image, i < 5 ? 1 : 0)
      .run();
  }
  let r = (await req("/factions")).data.find((x: any) => x.id === f);
  expect(r.readiness).toEqual({
    total: 20,
    normal: 15,
    exodia: 5,
    ready: true,
  });
  await db
    .prepare("UPDATE cards SET is_usable=0 WHERE faction_id=? AND name='카드0'")
    .bind(f)
    .run();
  r = (await req("/factions")).data.find((x: any) => x.id === f);
  expect(r.readiness.ready).toBe(false);
});
it("5 MiB 초과 사진과 연결된 이미지 삭제를 거부한다", async () => {
  const f = new FormData();
  f.set(
    "file",
    new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.png", {
      type: "image/png",
    }),
  );
  expect((await req("/uploads/card-image", "POST", f)).status).toBe(400);
  expect(
    (
      await req(
        "/uploads/card-image/" + encodeURIComponent(image),
        "DELETE",
        {},
      )
    ).status,
  ).toBe(409);
});
it("동시 저장에서 한 요청만 성공하고 이력도 한 번만 추가된다", async () => {
  const c = (await req("/cards", "POST", card())).data.id;
  const rs = await Promise.all([
    req("/cards/" + c, "PATCH", card({ name: "A", version: 1 })),
    req("/cards/" + c, "PATCH", card({ name: "B", version: 1 })),
  ]);
  expect(rs.map((x) => x.status).sort()).toEqual([200, 409]);
  expect((await req("/cards/" + c + "/audit")).data).toHaveLength(2);
});
it("보관해도 제작자와 관리자는 변경 이력을 확인할 수 있다", async () => {
  const c = (await req("/cards", "POST", card())).data.id;
  expect((await req("/cards/" + c, "DELETE", { version: 1 })).status).toBe(200);
  expect((await req("/cards/" + c)).status).toBe(404);
  expect((await req("/cards/" + c + "/audit")).status).toBe(200);
  expect(
    (await req("/cards/" + c + "/audit", "GET", undefined, otherCookie)).status,
  ).toBe(403);
});
it("잘못된 JSON 형식은 서버 오류 대신 입력 오류로 응답한다", async () => {
  expect((await req("/factions", "POST", null)).status).toBe(400);
});
it("관리자는 다른 제작자의 엑조디아를 보관해 슬롯을 회수할 수 있다", async () => {
  const id = (
    await req("/factions", "POST", { name: "관리 회수 진영", description: "" })
  ).data.id;
  let c;
  for (let i = 0; i < 5; i++)
    c = (await req("/cards", "POST", card({ faction_id: id, is_exodia: true })))
      .data.id;
  expect(
    (await req("/cards/" + c, "DELETE", { version: 1 }, adminCookie)).status,
  ).toBe(200);
  expect(
    (await req("/cards", "POST", card({ faction_id: id, is_exodia: true })))
      .status,
  ).toBe(201);
});
it("진영 이름 중복은 금지하되 제작자의 수정 권한을 유지한다", async () => {
  const created = await req("/factions", "POST", {
    name: "이름 중복 검사",
    description: "",
  });
  expect(created.status).toBe(201);
  expect(
    (
      await req(
        "/factions",
        "POST",
        { name: "  이름 중복 검사  ", description: "" },
        otherCookie,
      )
    ).status,
  ).toBe(409);
  expect(
    (
      await req("/factions/" + created.data.id, "PATCH", {
        name: "이름 중복 검사",
        description: "제작자 수정",
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await req(
        "/factions/" + created.data.id,
        "PATCH",
        { name: "이름 중복 검사", description: "타인 수정" },
        otherCookie,
      )
    ).status,
  ).toBe(403);
  const r = await Promise.all([
    req("/factions", "POST", { name: "동시 이름", description: "" }),
    req("/factions", "POST", { name: "동시 이름", description: "" }),
  ]);
  expect(r.map((x) => x.status).sort()).toEqual([201, 409]);
});
it("로그아웃 및 만료 세션 거부", async () => {
  const r = await req(
    "/auth/login",
    "POST",
    { email: "other@example.test", password: "Test-password-123" },
    "",
  );
  expect((await req("/auth/logout", "POST", {}, r.cookie)).status).toBe(200);
  expect((await req("/auth/me", "GET", undefined, r.cookie)).status).toBe(401);
  await db
    .prepare(
      "UPDATE sessions SET expires_at=0 WHERE user_id=(SELECT id FROM users WHERE email=?)",
    )
    .bind("other@example.test")
    .run();
  expect((await req("/auth/me", "GET", undefined, otherCookie)).status).toBe(
    401,
  );
});
