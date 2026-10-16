import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Bindings } from "../types";
export const uploadRoutes = new Hono<Bindings>();
function matches(a: Uint8Array, b: number[], offset = 0) {
  return b.every((v, i) => a[i + offset] === v);
}
function imageType(bytes: Uint8Array, mime: string) {
  return mime === "image/png"
    ? matches(bytes, [137, 80, 78, 71, 13, 10, 26, 10])
    : mime === "image/jpeg"
      ? matches(bytes, [255, 216, 255])
      : mime === "image/webp"
        ? matches(bytes, [82, 73, 70, 70]) &&
          matches(bytes, [87, 69, 66, 80], 8)
        : false;
}
uploadRoutes.post("/uploads/card-image", async (c) => {
  const form = await c.req.formData(),
    file = form.get("file");
  if (
    !file ||
    typeof file === "string" ||
    file.size < 12 ||
    file.size > 512 * 1024
  )
    throw new HTTPException(400, {
      message:
        "사진 저장 한도는 512 KiB입니다. 어드민에서 사진을 다시 선택해 압축해주세요.",
    });
  const data = await file.arrayBuffer();
  if (!imageType(new Uint8Array(data), file.type))
    throw new HTTPException(400, {
      message: "이미지 파일 내용과 형식이 일치하지 않습니다.",
    });
  const key = c.get("user").id + "/" + crypto.randomUUID();
  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO uploads(key,owner_user_id,mime) VALUES(?,?,?)",
    ).bind(key, c.get("user").id, file.type),
    c.env.DB.prepare("INSERT INTO image_data(key,data) VALUES(?,?)").bind(
      key,
      data,
    ),
  ]);
  return c.json({ key, url: "/api/images/" + encodeURIComponent(key) }, 201);
});
uploadRoutes.get("/images/:key", async (c) => {
  const key = c.req.param("key"),
    user = c.get("user");
  const record = await c.env.DB.prepare(
    "SELECT owner_user_id,mime FROM uploads WHERE key=?",
  )
    .bind(key)
    .first();
  if (!record) throw new HTTPException(404);
  if (record.owner_user_id !== user.id && user.role !== "admin") {
    const usable = await c.env.DB.prepare(
      "SELECT id FROM cards WHERE image_key=? AND archived=0 AND review_status='approved' AND is_usable=1 LIMIT 1",
    )
      .bind(key)
      .first();
    const game =
      !usable &&
      (await c.env.DB.prepare(
        "SELECT 1 FROM game_images i JOIN game_members m ON m.game_id=i.game_id WHERE i.image_key=? AND m.user_id=? LIMIT 1",
      )
        .bind(key, user.id)
        .first());
    if (!usable && !game) throw new HTTPException(403);
  }
  const object = await c.env.DB.prepare(
    "SELECT data FROM image_data WHERE key=?",
  )
    .bind(key)
    .first<{ data: number[] }>();
  if (!object) throw new HTTPException(404);
  return new Response(Uint8Array.from(object.data), {
    headers: {
      "Content-Type": String(record.mime),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
uploadRoutes.delete("/uploads/card-image/:key", async (c) => {
  const key = c.req.param("key"),
    record = await c.env.DB.prepare(
      "SELECT owner_user_id FROM uploads WHERE key=?",
    )
      .bind(key)
      .first();
  if (!record) throw new HTTPException(404);
  if (record.owner_user_id !== c.get("user").id) throw new HTTPException(403);
  const used = await c.env.DB.prepare(
    "SELECT id FROM cards WHERE image_key=? LIMIT 1",
  )
    .bind(key)
    .first();
  if (used)
    throw new HTTPException(409, {
      message: "카드에 연결된 이미지는 삭제할 수 없습니다.",
    });
  const game = await c.env.DB.prepare(
    "SELECT 1 FROM game_images WHERE image_key=? LIMIT 1",
  )
    .bind(key)
    .first();
  if (game)
    throw new HTTPException(409, {
      message: "대전 스냅샷에 연결된 이미지는 삭제할 수 없습니다.",
    });
  // FK prevents a concurrent card reference from racing the metadata deletion.
  await c.env.DB.prepare("DELETE FROM uploads WHERE key=?").bind(key).run();
  return c.json({ ok: true });
});
