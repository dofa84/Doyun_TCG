import { getCookie, setCookie } from "hono/cookie";
import type { Context } from "hono";
import type { Bindings, User } from "./types";
const hex = (a: ArrayBuffer) =>
  Array.from(new Uint8Array(a), (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
export async function digest(value: string) {
  return hex(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
}
export async function hashPassword(
  password: string,
  salt = hex(crypto.getRandomValues(new Uint8Array(16)).buffer),
) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return (
    salt +
    ":" +
    hex(
      await crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          hash: "SHA-256",
          salt: new TextEncoder().encode(salt),
          iterations: 100000,
        },
        key,
        256,
      ),
    )
  );
}
export async function verifyPassword(password: string, stored: string) {
  const candidate = await hashPassword(password, stored.split(":")[0]);
  let diff = candidate.length ^ stored.length;
  for (let i = 0; i < stored.length; i++)
    diff |= stored.charCodeAt(i) ^ (candidate.charCodeAt(i) || 0);
  return diff === 0;
}
export async function issueSession(c: Context<Bindings>, id: string) {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
  await c.env.DB.prepare(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",
  )
    .bind(await digest(token), id, Date.now() + 7 * 86400000)
    .run();
  setCookie(c, "tcg_session", token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Strict",
    path: "/",
    maxAge: 7 * 86400,
  });
}
export async function sessionUser(c: Context<Bindings>): Promise<User | null> {
  const token = getCookie(c, "tcg_session");
  if (!token) return null;
  return c.env.DB.prepare(
    "SELECT u.id,u.email,u.role,u.status FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>? AND u.status='active'",
  )
    .bind(await digest(token), Date.now())
    .first<User>();
}
export async function limitAuth(c: Context<Bindings>) {
  const key = await digest(
      "auth:" + (c.req.header("CF-Connecting-IP") || "local"),
    ),
    now = Date.now();
  await c.env.DB.prepare(
    "INSERT INTO auth_attempts(key,count,reset_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN reset_at<? THEN 1 ELSE count+1 END,reset_at=CASE WHEN reset_at<? THEN ? ELSE reset_at END",
  )
    .bind(key, now + 900000, now, now, now + 900000)
    .run();
  const r = await c.env.DB.prepare(
    "SELECT count FROM auth_attempts WHERE key=?",
  )
    .bind(key)
    .first<{ count: number }>();
  return (r?.count ?? 0) <= 30;
}
