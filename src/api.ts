export async function api<T = any>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const form = body instanceof FormData;
  const r = await fetch("/api" + path, {
    method,
    credentials: "same-origin",
    headers: form ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : form ? body : JSON.stringify(body),
  });
  const data = (await r.json()) as any;
  if (!r.ok) throw new Error(data.error ?? "요청에 실패했습니다.");
  return data as T;
}
export const imageUrl = (key: string) =>
  "/api/images/" + encodeURIComponent(key);
export type User = { id: string; email: string; role: "admin" | "user" };
export type Faction = {
  id: string;
  name: string;
  description: string;
  owner_user_id: string;
  readiness: { total: number; normal: number; exodia: number; ready: boolean };
};
export type Card = {
  id: string;
  owner_user_id: string;
  name: string;
  faction_id: string;
  faction_name: string;
  rarity: "common" | "rare" | "hero" | "legendary";
  hp: number;
  attack: number;
  image_key: string;
  is_exodia: number;
  passive_code: string | null;
  special_attack_code: string | null;
  review_status: string;
  rejection_reason: string | null;
  is_usable: number;
  version: number;
};
export const statusLabel: Record<string, string> = {
  draft: "초안",
  pending: "심사 대기",
  approved: "승인",
  rejected: "반려",
};
