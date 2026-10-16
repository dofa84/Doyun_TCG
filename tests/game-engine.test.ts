import { it, expect } from "vitest";
import { createGame, applyAction } from "../src/game/engine";
import { gameView } from "../src/game/view";
import type { SnapshotCard, GameState } from "../src/game/types";
const c = (id: string, extra = {}): SnapshotCard => ({
  instance_id: id,
  id,
  version: 1,
  name: id,
  image_key: "photo",
  rarity: "common",
  max_hp: 100,
  hp: 100,
  attack: 20,
  is_exodia: false,
  passive_code: null,
  special_attack_code: null,
  special_used: false,
  regen_uses: 0,
  ...extra,
});
function state(): GameState {
  return createGame(
    [
      [c("a"), c("a2"), c("hidden-a")],
      [c("b"), c("b2"), c("hidden-b")],
    ],
    0,
  );
}
it("최초 각1장만 공개하고 입력 덱을 변경하지 않는다", () => {
  const decks: [SnapshotCard[], SnapshotCard[]] = [
    [c("a"), c("a2")],
    [c("b"), c("b2")],
  ];
  const s = createGame(decks, 0);
  expect(s.players[0].slots.attack?.instance_id).toBe("a");
  expect(s.players[0].slots.defense).toBeNull();
  expect(decks[0]).toHaveLength(2);
});
it("초기 엑조디아는 추가 보충 없이 대기 칸", () => {
  const s = createGame(
    [
      [c("e", { is_exodia: true }), c("a")],
      [c("b"), c("b2")],
    ],
    0,
  );
  expect(s.players[0].waiting).toHaveLength(1);
  expect(s.players[0].deck).toHaveLength(1);
  expect(s.players[0].slots.attack).toBeNull();
});
it("오픈은 빈 칸을 채우고 턴 종료", () => {
  const s = state();
  const r = applyAction(s, 0, { type: "open", slot: "defense" });
  expect(r.state.players[0].slots.defense?.name).toBe("a2");
  expect(r.state.active_seat).toBe(1);
  expect(s.players[0].slots.defense).toBeNull();
  expect(() =>
    applyAction(r.state, 0, { type: "attack", slot: "attack", special: false }),
  ).toThrow();
});
it("두 빈 칸이면 배치 선택이 필요하고 찬 칸 선택은 불가", () => {
  const s = state();
  s.players[0].slots.attack = null;
  expect(() => applyAction(s, 0, { type: "open" })).toThrow();
  s.players[0].slots.attack = c("a");
  expect(() => applyAction(s, 0, { type: "open", slot: "attack" })).toThrow();
});
it("가득 찬 오픈은 비공개 버림이며 공개 응답·이벤트에 숨긴 이름 없음", () => {
  const s = state();
  s.players[0].slots.defense = c("d");
  const r = applyAction(s, 0, { type: "open" });
  expect(r.state.players[0].discard).toHaveLength(1);
  expect(
    JSON.stringify({ view: gameView(r.state), events: r.events }),
  ).not.toContain("hidden-a");
  expect(JSON.stringify(r.events)).not.toContain("a2");
  expect((gameView(r.state).players[0] as any).deck).toBeUndefined();
});
it("수비자가 두 카드 중 선택하기 전에는 HP와 턴이 유지", () => {
  const s = state();
  s.players[1].slots.defense = c("d");
  const r = applyAction(s, 0, {
    type: "attack",
    slot: "attack",
    special: false,
  });
  expect(r.state.pending_attack).not.toBeNull();
  expect(r.state.active_seat).toBe(0);
  expect(r.state.players[1].slots.attack?.hp).toBe(100);
  expect(() =>
    applyAction(r.state, 0, { type: "defend", slot: "attack" }),
  ).toThrow();
  const done = applyAction(r.state, 1, { type: "defend", slot: "defense" });
  expect(done.state.players[1].slots.defense?.hp).toBe(80);
  expect(done.state.active_seat).toBe(1);
});
it("방어 카드를 공격자로 고르면 교환 후 패시브 적용", () => {
  const s = state();
  s.players[0].slots.attack = c("support", { passive_code: "fury" });
  s.players[0].slots.defense = c("striker", { attack: 30 });
  const r = applyAction(s, 0, {
    type: "attack",
    slot: "defense",
    special: false,
  });
  expect(r.state.players[0].slots.attack?.name).toBe("striker");
  expect(r.state.players[1].slots.attack?.hp).toBe(67);
});
it.each([
  ["normal", 11, 91],
  ["power_strike", 11, 84],
  ["pierce", 11, 89],
])("철갑과 %s 정수 피해 계산", (kind, atk, hp) => {
  const s = state();
  s.players[0].slots.attack = c("a", {
    attack: atk,
    special_attack_code: kind === "normal" ? null : kind,
  });
  s.players[1].slots.defense = c("armored", { passive_code: "armor" });
  s.players[1].slots.attack = null;
  const r = applyAction(s, 0, {
    type: "attack",
    slot: "attack",
    special: kind !== "normal",
  });
  expect(r.state.players[1].slots.defense?.hp).toBe(hp);
});
it("최소 피해1, 반격·초과피해 이월 없음", () => {
  const s = state();
  s.players[0].slots.attack = c("a", { attack: 1 });
  s.players[1].slots.attack = null;
  s.players[1].slots.defense = c("d", { hp: 1, passive_code: "armor" });
  const r = applyAction(s, 0, {
    type: "attack",
    slot: "attack",
    special: false,
  });
  expect(r.state.players[1].dead).toHaveLength(1);
  expect(r.state.players[1].slots.defense?.hp).toBe(100);
  expect(r.state.players[0].slots.attack?.hp).toBe(100);
});
it("사망 보충의 다섯 번째 엑조디아가 전투 패배보다 우선", () => {
  const s = state();
  s.players[1].slots.attack = c("last", { hp: 1 });
  s.players[1].deck = [c("e5", { is_exodia: true })];
  s.players[1].waiting = Array.from({ length: 4 }, (_, i) =>
    c("e" + i, { is_exodia: true }),
  );
  const r = applyAction(s, 0, {
    type: "attack",
    slot: "attack",
    special: false,
  });
  expect(r.state.winner).toBe(1);
  expect(r.state.win_reason).toBe("exodia");
});
it("보충 엑조디아는 딱1장만 열고 빈 칸 유지", () => {
  const s = state();
  s.players[1].slots.attack = c("last", { hp: 1 });
  s.players[1].deck = [c("e", { is_exodia: true }), c("next")];
  const r = applyAction(s, 0, {
    type: "attack",
    slot: "attack",
    special: false,
  });
  expect(r.state.players[1].slots.attack).toBeNull();
  expect(r.state.players[1].deck).toHaveLength(1);
  expect(r.state.active_seat).toBe(1);
});
it("전장과 남은 덱에 일반 카드가 없으면 패배", () => {
  const s = state();
  s.players[1].slots.attack = c("last", { hp: 1 });
  s.players[1].deck = [];
  const r = applyAction(s, 0, {
    type: "attack",
    slot: "attack",
    special: false,
  });
  expect(r.state.winner).toBe(0);
  expect(() => applyAction(r.state, 0, { type: "open" })).toThrow();
});
it("특수는 게임1회이며 잘못된 요청은 사용권 소비 없음", () => {
  const s = state();
  s.players[0].slots.attack = c("a", { hp: 50, special_attack_code: "heal" });
  const r = applyAction(s, 0, {
    type: "attack",
    slot: "attack",
    special: true,
  });
  expect(r.state.players[0].slots.attack?.hp).toBe(75);
  expect(r.state.players[0].slots.attack?.special_used).toBe(true);
  r.state.active_seat = 0;
  expect(() =>
    applyAction(r.state, 0, { type: "attack", slot: "attack", special: true }),
  ).toThrow();
  expect(s.players[0].slots.attack?.special_used).toBe(false);
});
it("재생은 실제 회복만 소비하고 카드당3회, 자리 이동으로 초기화 없음", () => {
  const s = state();
  s.players[1].slots.defense = c("regen", {
    hp: 50,
    passive_code: "regeneration",
    regen_uses: 2,
  });
  let r = applyAction(s, 0, { type: "open" }).state;
  expect(r.players[1].slots.defense?.hp).toBe(55);
  expect(r.players[1].slots.defense?.regen_uses).toBe(3);
  r.active_seat = 0;
  r.players[0].deck.push(c("extra"));
  r = applyAction(r, 0, { type: "open" }).state;
  expect(r.players[1].slots.defense?.hp).toBe(55);
});
it("공격 대상 없고 덱도 없으면 자동 패스하되 카드가 있으면 패배 아님", () => {
  const s = state();
  s.players[1].slots.attack = null;
  s.players[1].deck = [c("e", { is_exodia: true }), c("future")];
  s.players[0].deck = [];
  s.active_seat = 1;
  const r = applyAction(s, 1, { type: "open", slot: "attack" });
  expect(r.state.active_seat).toBe(1);
  expect(r.events.some((e) => e.type === "pass")).toBe(true);
});
