import type { GameView } from "./types";
export type GameSession = {
  id: string;
  status: "waiting" | "active" | "finished";
  version: number;
  members: {
    seat: 0 | 1;
    user_id: string;
    email: string;
    faction_id: string;
    faction_name: string;
  }[];
  view: GameView | null;
  device_ready: boolean;
  authorized_seats: [boolean, boolean];
};
export class GameHttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function gameApi<T = GameSession>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const r = await fetch("/api" + path, {
    method,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await r.json()) as { error?: string };
  if (!r.ok)
    throw new GameHttpError(
      r.status,
      data.error ?? "게임 요청에 실패했습니다.",
    );
  return data as T;
}
