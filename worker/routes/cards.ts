import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Bindings } from "../types";
import { validateCard, readiness } from "../../src/domain";
export const cardsRoutes = new Hono<Bindings>();
type Row = {
  id: string;
  owner_user_id: string;
  review_status: string;
  is_usable: number;
  version: number;
  archived: number;
  [key: string]: any;
};
async function load(c: any, includeArchived = false): Promise<Row> {
  const card = await c.env.DB.prepare(
    "SELECT c.*,f.name AS faction_name FROM cards c JOIN factions f ON f.id=c.faction_id WHERE c.id=? AND (?=1 OR c.archived=0)",
  )
    .bind(c.req.param("id"), includeArchived ? 1 : 0)
    .first();
  if (!card)
    throw new HTTPException(404, { message: "카드를 찾을 수 없습니다." });
  return card;
}
function mayEdit(card: Row, user: { id: string }) {
  if (card.owner_user_id !== user.id)
    throw new HTTPException(403, {
      message: "제작자만 카드를 수정할 수 있습니다.",
    });
}
function mayRead(card: Row, user: { id: string; role: string }) {
  if (
    card.owner_user_id !== user.id &&
    user.role !== "admin" &&
    !(card.review_status === "approved" && card.is_usable)
  )
    throw new HTTPException(403);
}
function version(b: any) {
  if (!b || !Number.isInteger(b.version) || b.version < 1)
    throw new HTTPException(400, { message: "카드 버전을 확인해주세요." });
  return b.version;
}
async function input(c: any, b: any) {
  let v;
  try {
    v = validateCard(b);
  } catch (e) {
    throw new HTTPException(400, { message: (e as Error).message });
  }
  const f = await c.env.DB.prepare(
    "SELECT id FROM factions WHERE id=? AND disabled=0",
  )
    .bind(v.faction_id)
    .first();
  if (!f) throw new HTTPException(400, { message: "진영을 확인해주세요." });
  const image = await c.env.DB.prepare(
    "SELECT owner_user_id FROM uploads WHERE key=?",
  )
    .bind(v.image_key)
    .first();
  if (!image || image.owner_user_id !== c.get("user").id)
    throw new HTTPException(403, {
      message: "본인이 올린 이미지만 사용할 수 있습니다.",
    });
  return v;
}
async function update(
  c: any,
  card: Row,
  b: any,
  assignments: string,
  values: unknown[],
  action: string,
  to: string,
  reason: string | null = null,
) {
  const v = version(b);
  if (v !== card.version)
    throw new HTTPException(409, {
      message: "다른 변경이 있습니다. 새로고침 후 다시 시도해주세요.",
    });
  const result = await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE cards SET " +
        assignments +
        ",version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND version=? AND archived=0",
    ).bind(...values, card.id, v),
    c.env.DB.prepare(
      "INSERT INTO card_audit_logs(id,card_id,actor_user_id,action,from_status,to_status,reason,card_version) SELECT ?,?,?,?,?,?,?,? WHERE changes()=1",
    ).bind(
      crypto.randomUUID(),
      card.id,
      c.get("user").id,
      action,
      card.review_status,
      to,
      reason,
      v + 1,
    ),
  ]);
  if (!result[0].meta.changes)
    throw new HTTPException(409, {
      message: "카드가 변경되었습니다. 새로고침해주세요.",
    });
  return c.json({ ok: true });
}
cardsRoutes.get("/cards", async (c) => {
  const user = c.get("user");
  const r = await c.env.DB.prepare(
    "SELECT c.*,f.name AS faction_name FROM cards c JOIN factions f ON f.id=c.faction_id WHERE c.archived=0 AND (c.owner_user_id=? OR ?='admin' OR (c.review_status='approved' AND c.is_usable=1)) ORDER BY c.created_at DESC",
  )
    .bind(user.id, user.role)
    .all();
  return c.json(r.results);
});
cardsRoutes.post("/cards", async (c) => {
  const v = await input(c, await c.req.json()),
    id = crypto.randomUUID();
  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO cards(id,owner_user_id,faction_id,name,rarity,hp,attack,image_key,is_exodia,passive_code,special_attack_code) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    ).bind(
      id,
      c.get("user").id,
      v.faction_id,
      v.name,
      v.rarity,
      v.hp,
      v.attack,
      v.image_key,
      v.is_exodia ? 1 : 0,
      v.passive_code,
      v.special_attack_code,
    ),
    c.env.DB.prepare(
      "INSERT INTO card_audit_logs(id,card_id,actor_user_id,action,to_status,card_version) VALUES(?,?,?,'create','draft',1)",
    ).bind(crypto.randomUUID(), id, c.get("user").id),
  ]);
  return c.json({ id }, 201);
});
cardsRoutes.get("/cards/:id", async (c) => {
  const card = await load(c);
  mayRead(card, c.get("user"));
  return c.json(card);
});
cardsRoutes.get("/cards/:id/audit", async (c) => {
  const card = await load(c, true);
  if (card.owner_user_id !== c.get("user").id && c.get("user").role !== "admin")
    throw new HTTPException(403);
  return c.json(
    (
      await c.env.DB.prepare(
        "SELECT action,from_status,to_status,reason,card_version,created_at FROM card_audit_logs WHERE card_id=? ORDER BY card_version DESC",
      )
        .bind(card.id)
        .all()
    ).results,
  );
});
cardsRoutes.patch("/cards/:id", async (c) => {
  const card = await load(c);
  mayEdit(card, c.get("user"));
  const b = await c.req.json(),
    v = await input(c, b);
  const to =
    card.review_status === "approved" || card.review_status === "pending"
      ? "pending"
      : "draft";
  return update(
    c,
    card,
    b,
    "faction_id=?,name=?,rarity=?,hp=?,attack=?,image_key=?,is_exodia=?,passive_code=?,special_attack_code=?,review_status=?,is_usable=0,rejection_reason=NULL",
    [
      v.faction_id,
      v.name,
      v.rarity,
      v.hp,
      v.attack,
      v.image_key,
      v.is_exodia ? 1 : 0,
      v.passive_code,
      v.special_attack_code,
      to,
    ],
    "edit",
    to,
  );
});
cardsRoutes.delete("/cards/:id", async (c) => {
  const card = await load(c);
  if (c.get("user").role !== "admin") mayEdit(card, c.get("user"));
  return update(
    c,
    card,
    await c.req.json(),
    "archived=1,is_usable=0",
    [],
    "archive",
    card.review_status,
  );
});
cardsRoutes.post("/cards/:id/submit", async (c) => {
  const card = await load(c);
  mayEdit(card, c.get("user"));
  if (!["draft", "rejected"].includes(card.review_status))
    throw new HTTPException(409, {
      message: "초안 또는 반려 카드만 심사를 요청할 수 있습니다.",
    });
  return update(
    c,
    card,
    await c.req.json(),
    "review_status='pending',is_usable=0,rejection_reason=NULL",
    [],
    "submit",
    "pending",
  );
});
cardsRoutes.use("/admin/*", async (c, next) => {
  if (c.get("user").role !== "admin")
    throw new HTTPException(403, { message: "관리자 권한이 필요합니다." });
  await next();
});
cardsRoutes.get("/admin/cards", async (c) => {
  const status = c.req.query("status");
  return c.json(
    (
      await c.env.DB.prepare(
        "SELECT c.*,f.name AS faction_name FROM cards c JOIN factions f ON f.id=c.faction_id WHERE c.archived=0 AND (? IS NULL OR c.review_status=?) ORDER BY c.updated_at DESC",
      )
        .bind(status ?? null, status ?? null)
        .all()
    ).results,
  );
});
cardsRoutes.get("/admin/factions/readiness", async (c) => {
  const fs = (await c.env.DB.prepare("SELECT * FROM factions").all()).results,
    cs = (await c.env.DB.prepare("SELECT * FROM cards WHERE archived=0").all())
      .results;
  return c.json(
    fs.map((f) => ({
      ...f,
      readiness: {
        ...readiness(cs.filter((x) => x.faction_id === f.id) as any),
        ...(f.disabled ? { ready: false } : {}),
      },
    })),
  );
});
cardsRoutes.post("/admin/cards/:id/:action", async (c) => {
  const card = await load(c),
    b = await c.req.json(),
    action = c.req.param("action");
  if (action === "approve" || action === "reject") {
    if (card.review_status !== "pending")
      throw new HTTPException(409, {
        message: "심사 대기 카드만 처리할 수 있습니다.",
      });
    const reason = action === "reject" ? String(b.reason ?? "").trim() : null;
    if (action === "reject" && (!reason || reason.length > 500))
      throw new HTTPException(400, {
        message: "반려 사유를 1~500자로 입력해주세요.",
      });
    const to = action === "approve" ? "approved" : "rejected";
    return update(
      c,
      card,
      b,
      "review_status=?,is_usable=0,rejection_reason=?",
      [to, reason],
      action,
      to,
      reason,
    );
  }
  if (action === "enable" || action === "disable") {
    if (action === "enable" && card.review_status !== "approved")
      throw new HTTPException(409, {
        message: "승인 카드만 활성화할 수 있습니다.",
      });
    return update(
      c,
      card,
      b,
      "is_usable=?",
      [action === "enable" ? 1 : 0],
      action,
      card.review_status,
    );
  }
  throw new HTTPException(404);
});
