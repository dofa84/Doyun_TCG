import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { bodyLimit } from "hono/body-limit";
import type { Bindings } from "../types";
import {
  createLobby,
  joinGame,
  getGame,
  getMemberGame,
  members,
  saveAction,
  conflict,
} from "../game-repository";
import {
  readDevice,
  authorizeDevice,
  requireGameDevice,
  currentSession,
} from "../game-auth";
import { gameView } from "../../src/game/view";
import { applyAction } from "../../src/game/engine";
import type { GameState, GameAction } from "../../src/game/types";
export const gamesRoutes = new Hono<Bindings>();
gamesRoutes.use(
  "/games/*",
  bodyLimit({
    maxSize: 4096,
    onError: (c) => c.json({ error: "게임 요청이 너무 큽니다." }, 413),
  }),
);
gamesRoutes.use(
  "/games",
  bodyLimit({
    maxSize: 4096,
    onError: (c) => c.json({ error: "게임 요청이 너무 큽니다." }, 413),
  }),
);
async function body(c: Context<Bindings>) {
  const b = await c.req.json();
  if (!b || typeof b !== "object" || Array.isArray(b))
    throw new HTTPException(400);
  return b as Record<string, unknown>;
}
function string(v: unknown) {
  if (typeof v !== "string" || !/^[\w-]{1,100}$/.test(v))
    throw new HTTPException(400, { message: "요청 식별자를 확인해주세요." });
  return v;
}
function version(v: unknown) {
  if (!Number.isSafeInteger(v) || Number(v) < 0) throw new HTTPException(400);
  return Number(v);
}
async function envelope(c: Context<Bindings>, id: string) {
  const g = await getGame(c.env.DB, id),
    d = await readDevice(c, id);
  return {
    id: g.id,
    status: g.status,
    version: g.version,
    members: d.members,
    view: g.state_json ? gameView(JSON.parse(g.state_json) as GameState) : null,
    device_ready: d.ready.every(Boolean),
    authorized_seats: d.ready,
  };
}
gamesRoutes.get("/games", async (c) => {
  const offset = Number(c.req.query("offset") ?? 0);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10000)
    throw new HTTPException(400);
  const games = (
    await c.env.DB.prepare(
      "SELECT g.id,g.status,g.version,g.created_at,g.turn_number,json_extract(g.state_json,'$.winner') AS winner FROM games g JOIN game_members m ON m.game_id=g.id WHERE m.user_id=? ORDER BY g.created_at DESC,g.id DESC LIMIT 50 OFFSET ?",
    )
      .bind(c.get("user").id, offset)
      .all()
  ).results;
  return c.json({
    games,
    offset,
    next_offset: games.length === 50 ? offset + 50 : null,
  });
});
gamesRoutes.post("/games", async (c) => {
  const b = await body(c),
    g = await createLobby(
      c.env.DB,
      c.get("user").id,
      await currentSession(c),
      string(b.faction_id),
      string(b.request_id),
    );
  await authorizeDevice(c, g.id, 0);
  return c.json(await envelope(c, g.id), 201);
});
gamesRoutes.get("/games/:id", async (c) => {
  const id = c.req.param("id"),
    g = await getGame(c.env.DB, id),
    d = await readDevice(c, id);
  if (
    !d.members.some((m) => m.user_id === c.get("user").id) &&
    !(g.status === "waiting" && d.ready[0])
  )
    throw new HTTPException(404);
  return c.json(await envelope(c, id));
});
gamesRoutes.post("/games/:id/join", async (c) => {
  const id = c.req.param("id"),
    d = await readDevice(c, id);
  if (!d.ready[0] || !d.row)
    throw new HTTPException(403, {
      message: "대기방을 만든 기기에서 참가해주세요.",
    });
  const b = await body(c);
  await joinGame(
    c.env.DB,
    id,
    c.get("user").id,
    await currentSession(c),
    string(b.faction_id),
    string(b.request_id),
    version(b.expected_version),
    d.row.token_hash,
  );
  return c.json(await envelope(c, id));
});
gamesRoutes.post("/games/:id/device-authorizations", async (c) => {
  const id = c.req.param("id");
  await getMemberGame(c.env.DB, id, c.get("user").id);
  const ms = await members(c.env.DB, id),
    seat = ms.find((m) => m.user_id === c.get("user").id)!.seat;
  await authorizeDevice(c, id, seat);
  return c.json(await envelope(c, id));
});
gamesRoutes.post("/games/:id/actions", async (c) => {
  const id = c.req.param("id");
  await requireGameDevice(c, id);
  const b = await body(c),
    request = string(b.request_id),
    expected = version(b.expected_version);
  const duplicate = await c.env.DB.prepare(
    "SELECT applied_version FROM game_actions WHERE game_id=? AND request_id=?",
  )
    .bind(id, request)
    .first();
  if (duplicate)
    return c.json({
      ...(await envelope(c, id)),
      duplicate: true,
      applied_version: duplicate.applied_version,
    });
  const g = await getGame(c.env.DB, id);
  if (g.version !== expected || g.status !== "active" || !g.state_json)
    throw conflict();
  const actor = b.actor_seat;
  if (actor !== 0 && actor !== 1) throw new HTTPException(400);
  const state = JSON.parse(g.state_json) as GameState;
  if (gameView(state).actor_seat !== actor) throw conflict();
  if (!b.action || typeof b.action !== "object" || Array.isArray(b.action))
    throw new HTTPException(400);
  let next;
  try {
    next = applyAction(state, actor, b.action as GameAction);
  } catch (e) {
    throw new HTTPException(400, { message: (e as Error).message });
  }
  const saved = await saveAction(
    c.env.DB,
    id,
    expected,
    request,
    next.state,
    next.events,
  );
  return c.json({ ...(await envelope(c, id)), applied_version: saved.version });
});
gamesRoutes.get("/games/:id/events", async (c) => {
  const id = c.req.param("id");
  await getMemberGame(c.env.DB, id, c.get("user").id);
  const after = Number(c.req.query("after") ?? 0);
  if (!Number.isSafeInteger(after) || after < 0) throw new HTTPException(400);
  const rows = (
    await c.env.DB.prepare(
      "SELECT applied_version,events_json FROM game_actions WHERE game_id=? AND applied_version>? ORDER BY applied_version LIMIT 50",
    )
      .bind(id, after)
      .all<{ applied_version: number; events_json: string }>()
  ).results;
  return c.json({
    events: rows.map((r) => ({
      version: r.applied_version,
      events: JSON.parse(r.events_json),
    })),
  });
});
