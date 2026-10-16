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
    file.size > 5 * 1024 * 1024
  )
    throw new HTTPException(400, {
      message: "PNG/JPEG/WebP 이미지를 5 MiB 이하로 올려주세요.",
    });
  const data = await file.arrayBuffer();
  if (!imageType(new Uint8Array(data), file.type))
    throw new HTTPException(400, {
      message: "이미지 파일 내용과 형식이 일치하지 않습니다.",
    });
  const key = c.get("user").id + "/" + crypto.randomUUID();
  await c.env.IMAGES.put(key, data, {
    httpMetadata: { contentType: file.type },
  });
  try {
    await c.env.DB.prepare(
      "INSERT INTO uploads(key,owner_user_id,mime) VALUES(?,?,?)",
    )
      .bind(key, c.get("user").id, file.type)
      .run();
  } catch (e) {
    await c.env.IMAGES.delete(key);
    throw e;
  }
  return c.json({ key, url: "/api/images/" + encodeURIComponent(key) }, 201);
});
uploadRoutes.get("/images/:key", async (c) => {
  const key = c.req.param("key"),
    user = c.get("user");
  const record = await c.env.DB.prepare("SELECT * FROM uploads WHERE key=?")
    .bind(key)
    .first();
  if (!record) throw new HTTPException(404);
  if (record.owner_user_id !== user.id && user.role !== "admin") {
    const usable = await c.env.DB.prepare(
      "SELECT id FROM cards WHERE image_key=? AND archived=0 AND review_status='approved' AND is_usable=1 LIMIT 1",
    )
      .bind(key)
      .first();
    if (!usable) throw new HTTPException(403);
  }
  const object = await c.env.IMAGES.get(key);
  if (!object) throw new HTTPException(404);
  return new Response(object.body, {
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
  // FK prevents a concurrent card reference from racing the metadata deletion.
  await c.env.DB.prepare("DELETE FROM uploads WHERE key=?").bind(key).run();
  await c.env.IMAGES.delete(key);
  return c.json({ ok: true });
});
