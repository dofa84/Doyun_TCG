import { it, expect } from "vitest";
import {
  readPending,
  writePending,
  clearPending,
} from "../src/game/pending-operation";
function storage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
    removeItem: (k: string) => {
      data.delete(k);
    },
  };
}
it("미확정 공개 식별자는 계정별로 복원하고 다른 계정에 표시하지 않는다", () => {
  const s = storage(),
    op = { path: "/games", body: { request_id: "r1", faction_id: "f1" } };
  writePending("user-a", op, s);
  expect(readPending("user-a", s)).toEqual(op);
  expect(readPending("user-b", s)).toBeNull();
  clearPending("user-a", s);
  expect(readPending("user-a", s)).toBeNull();
});
it("비밀번호·토큰·인증 경로는 임시 요청 저장에 허용하지 않는다", () => {
  const s = storage();
  expect(() =>
    writePending(
      "a",
      { path: "/auth/login", body: { email: "x", password: "secret" } },
      s,
    ),
  ).toThrow();
  expect(() =>
    writePending(
      "a",
      {
        path: "/games",
        body: { request_id: "r", faction_id: "f", password: "secret" },
      },
      s,
    ),
  ).toThrow();
  expect(readPending("a", s)).toBeNull();
});
it("허용된 행동만 저장하고 손상 데이터는 요청으로 실행하지 않는다", () => {
  const s = storage();
  expect(() =>
    writePending(
      "a",
      {
        path: "/games/123/actions",
        body: {
          request_id: "r",
          expected_version: 1,
          actor_seat: 0,
          action: {
            type: "attack",
            slot: "attack",
            special: false,
            token: "forged",
          },
        },
      },
      s,
    ),
  ).toThrow();
  s.setItem("tcg-game-pending:a", "invalid json");
  expect(readPending("a", s)).toBeNull();
});
it("브라우저 임시 저장이 차단되면 서버 요청 전 저장 실패를 알린다", () => {
  const s = storage();
  s.setItem = () => {
    throw Error("storage blocked");
  };
  expect(() =>
    writePending(
      "a",
      { path: "/games", body: { request_id: "r", faction_id: "f" } },
      s,
    ),
  ).toThrow();
});
