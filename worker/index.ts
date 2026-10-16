import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { getCookie, deleteCookie } from "hono/cookie";
import type { Bindings } from "./types";
import {
  digest,
  hashPassword,
  verifyPassword,
  issueSession,
  sessionUser,
  limitAuth,
} from "./auth";
import { validateCard, readiness, passives, specials } from "../src/domain";
import { cardsRoutes } from "./routes/cards";
import { uploadRoutes } from "./routes/uploads";
const app = new Hono<Bindings>();
app.use("/api/*", async (c, next) => {
  if (
    !["GET", "HEAD", "OPTIONS"].includes(c.req.method) &&
    c.req.header("Origin") !== new URL(c.req.url).origin
  )
    throw new HTTPException(403, { message: "요청 출처가 일치하지 않습니다." });
  await next();
  c.header("Cache-Control", "no-store");
  c.header("X-Content-Type-Options", "nosniff");
});
app.use(
  "/api/*",
  bodyLimit({
    maxSize: 6 * 1024 * 1024,
    onError: (c) => c.json({ error: "파일은 5 MiB 이하로 올려주세요." }, 413),
  }),
);
app.get("/api/health", (c) => c.json({ ok: true, service: "doyun-tcg" }));
app.post("/api/auth/:action", async (c) => {
  const action = c.req.param("action");
  if (action === "logout") {
    const token = getCookie(c, "tcg_session");
    if (token)
      await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash=?")
        .bind(await digest(token))
        .run();
    deleteCookie(c, "tcg_session", { path: "/" });
    return c.json({ ok: true });
  }
  if (!["register", "login"].includes(action)) throw new HTTPException(404);
  if (!(await limitAuth(c)))
    throw new HTTPException(429, {
      message: "요청이 많습니다. 15분 뒤 다시 시도해주세요.",
    });
  const body = await c.req.json().catch(() => null);
  if (
    !body ||
    typeof body.email !== "string" ||
    typeof body.password !== "string"
  )
    throw new HTTPException(400, {
      message: "이메일과 비밀번호를 입력해주세요.",
    });
  const email = body.email.trim().toLowerCase(),
    password = body.password;
  if (
    email.length > 254 ||
    !(
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      (action === "login" && /^[a-z][a-z0-9_-]{2,31}$/.test(email))
    ) ||
    password.length > 128
  )
    throw new HTTPException(400, { message: "입력 형식을 확인해주세요." });
  if (action === "register") {
    if (password.length < 12)
      throw new HTTPException(400, { message: "비밀번호는 12자 이상입니다." });
    const id = crypto.randomUUID();
    await c.env.DB.prepare(
      "INSERT INTO users(id,email,password_hash) VALUES(?,?,?)",
    )
      .bind(id, email, await hashPassword(password))
      .run();
    await issueSession(c, id);
    return c.json({ user: { id, email, role: "user" } }, 201);
  }
  const user = await c.env.DB.prepare(
    "SELECT * FROM users WHERE email=? OR login_name=?",
  )
    .bind(email, email)
    .first<{
      id: string;
      email: string;
      role: string;
      status: string;
      password_hash: string;
    }>();
  const stored =
    user?.password_hash ?? "00000000000000000000000000000000:" + "0".repeat(64);
  if (
    !(await verifyPassword(password, stored)) ||
    !user ||
    user.status !== "active"
  )
    throw new HTTPException(401, {
      message: "이메일 또는 비밀번호를 확인해주세요.",
    });
  await issueSession(c, user.id);
  return c.json({ user: { id: user.id, email: user.email, role: user.role } });
});
app.use("/api/*", async (c, next) => {
  const user = await sessionUser(c);
  if (!user) throw new HTTPException(401, { message: "로그인이 필요합니다." });
  c.set("user", user);
  await next();
});
app.get("/api/auth/me", (c) => c.json({ user: c.get("user") }));
app.get("/api/effects", (c) => c.json({ passives, specials }));
app.get("/api/factions", async (c) => {
  const factions = (
    await c.env.DB.prepare(
      "SELECT * FROM factions ORDER BY created_at DESC",
    ).all()
  ).results;
  const cards = (
    await c.env.DB.prepare(
      "SELECT id,faction_id,is_exodia,review_status,is_usable,archived FROM cards WHERE archived=0",
    ).all()
  ).results;
  return c.json(
    factions.map((f) => ({
      ...f,
      readiness: {
        ...readiness(cards.filter((x) => x.faction_id === f.id) as any),
        ...(f.disabled ? { ready: false } : {}),
      },
    })),
  );
});
app.get("/api/factions/:id", async (c) => {
  const faction = await c.env.DB.prepare("SELECT * FROM factions WHERE id=?")
    .bind(c.req.param("id"))
    .first();
  if (!faction)
    throw new HTTPException(404, { message: "진영을 찾을 수 없습니다." });
  const cards = (
    await c.env.DB.prepare(
      "SELECT id,is_exodia,review_status,is_usable,archived FROM cards WHERE faction_id=? AND archived=0",
    )
      .bind(c.req.param("id"))
      .all()
  ).results;
  return c.json({
    ...faction,
    readiness: {
      ...readiness(cards as any),
      ...(faction.disabled ? { ready: false } : {}),
    },
  });
});
app.post("/api/factions", async (c) => {
  const b = await c.req.json();
  if (b && typeof b.name === "string") b.name = b.name.normalize("NFC").trim();
  if (!b || typeof b !== "object" || Array.isArray(b))
    throw new HTTPException(400, { message: "진영 정보를 확인해주세요." });
  if (
    typeof b.name !== "string" ||
    !b.name.trim() ||
    b.name.length > 60 ||
    typeof (b.description ?? "") !== "string" ||
    (b.description ?? "").length > 500
  )
    throw new HTTPException(400, {
      message: "진영 이름은 1~60자, 설명은 500자 이내입니다.",
    });
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    "INSERT INTO factions(id,owner_user_id,name,description) VALUES(?,?,?,?)",
  )
    .bind(id, c.get("user").id, b.name.trim(), b.description ?? "")
    .run();
  return c.json({ id }, 201);
});
app.patch("/api/factions/:id", async (c) => {
  const f = await c.env.DB.prepare("SELECT * FROM factions WHERE id=?")
    .bind(c.req.param("id"))
    .first();
  if (!f) throw new HTTPException(404);
  if (f.owner_user_id !== c.get("user").id && c.get("user").role !== "admin")
    throw new HTTPException(403);
  const b = await c.req.json();
  if (b && typeof b.name === "string") b.name = b.name.normalize("NFC").trim();
  if (!b || typeof b !== "object" || Array.isArray(b))
    throw new HTTPException(400, { message: "진영 정보를 확인해주세요." });
  if (
    typeof b.name !== "string" ||
    !b.name.trim() ||
    b.name.length > 60 ||
    typeof b.description !== "string" ||
    b.description.length > 500
  )
    throw new HTTPException(400);
  await c.env.DB.prepare(
    "UPDATE factions SET name=?,description=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
  )
    .bind(b.name.trim(), b.description, c.req.param("id"))
    .run();
  return c.json({ ok: true });
});
app.route("/api", cardsRoutes);
app.route("/api", uploadRoutes);
app.notFound((c) => c.json({ error: "요청한 항목을 찾을 수 없습니다." }, 404));
app.onError((e, c) => {
  if (e instanceof HTTPException)
    return c.json(
      { error: e.message || "요청을 처리할 수 없습니다." },
      e.status,
    );
  const message = String(e);
  if (message.includes("factions_name_unique"))
    return c.json({ error: "이미 사용 중인 진영 이름입니다." }, 409);
  if (message.includes("exodia_limit"))
    return c.json({ error: "진영별 엑조디아는 최대 5장입니다." }, 409);
  if (message.includes("UNIQUE constraint failed: users.email"))
    return c.json({ error: "이미 등록된 이메일입니다." }, 409);
  if (e instanceof SyntaxError)
    return c.json({ error: "입력 데이터를 확인해주세요." }, 400);
  console.error("request_failed", c.req.method, c.req.path);
  return c.json({ error: "처리에 실패했습니다. 다시 시도해주세요." }, 500);
});
export default app;
