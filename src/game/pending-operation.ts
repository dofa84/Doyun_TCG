// Only public game identifiers/actions are retained in this tab. Never auth
// payloads, cookies, card snapshots, passwords, or tokens.
export type PendingOperation = { path: string; body: unknown };
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const key = (user: string) => "tcg-game-pending:" + user;
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const id = (v: unknown) => typeof v === "string" && /^[\w-]{1,100}$/.test(v);
const integer = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0;
const keys = (v: Record<string, unknown>, names: string[]) =>
  Object.keys(v).every((k) => names.includes(k));
function valid(v: unknown): v is PendingOperation {
  if (
    !object(v) ||
    !keys(v, ["path", "body"]) ||
    typeof v.path !== "string" ||
    !object(v.body)
  )
    return false;
  const b = v.body;
  if (v.path === "/games")
    return (
      keys(b, ["request_id", "faction_id"]) &&
      id(b.request_id) &&
      id(b.faction_id)
    );
  if (
    !/^\/games\/[a-f0-9-]+\/(join|actions|device-authorizations)$/.test(v.path)
  )
    return false;
  if (v.path.endsWith("/device-authorizations"))
    return Object.keys(b).length === 0;
  if (v.path.endsWith("/join"))
    return (
      keys(b, ["request_id", "faction_id", "expected_version"]) &&
      id(b.request_id) &&
      id(b.faction_id) &&
      integer(b.expected_version)
    );
  if (
    !keys(b, ["request_id", "expected_version", "actor_seat", "action"]) ||
    !id(b.request_id) ||
    !integer(b.expected_version) ||
    (b.actor_seat !== 0 && b.actor_seat !== 1) ||
    !object(b.action)
  )
    return false;
  const a = b.action,
    slot = a.slot === "attack" || a.slot === "defense";
  return a.type === "open"
    ? keys(a, ["type", "slot"]) && (a.slot === undefined || slot)
    : a.type === "defend"
      ? keys(a, ["type", "slot"]) && slot
      : a.type === "attack" &&
        keys(a, ["type", "slot", "special"]) &&
        slot &&
        typeof a.special === "boolean";
}
export function readPending(
  user: string,
  store: Store = sessionStorage,
): PendingOperation | null {
  try {
    const text = store.getItem(key(user));
    if (!text) return null;
    const v: unknown = JSON.parse(text);
    if (valid(v) && text.length <= 4096) return v;
    store.removeItem(key(user));
  } catch {
    /* unavailable/malformed storage is not an executable request */
  }
  return null;
}
export function writePending(
  user: string,
  op: PendingOperation,
  store: Store = sessionStorage,
) {
  const text = JSON.stringify(op);
  if (!valid(op) || text.length > 4096)
    throw Error("저장할 게임 요청을 확인해주세요.");
  try {
    store.setItem(key(user), text);
  } catch {
    throw Error(
      "이 브라우저의 임시 저장이 차단되어 안전하게 요청할 수 없습니다.",
    );
  }
}
export function clearPending(user: string, store: Store = sessionStorage) {
  store.removeItem(key(user));
}
