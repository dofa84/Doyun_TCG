import { describe, it, expect } from "vitest";
import { validateCard, readiness, selectGameCards } from "../src/domain";
const input = {
  name: "불꽃 기사",
  faction_id: "f",
  rarity: "rare",
  hp: 100,
  attack: 20,
  image_key: "x",
  is_exodia: false,
  passive_code: null,
  special_attack_code: null,
};
describe("카드 규칙", () => {
  it.each([9, 10001, 1.5])("HP %s 거부", (hp) =>
    expect(() => validateCard({ ...input, hp })).toThrow(),
  );
  it.each([0, 1001, 1.5])("공격력 %s 거부", (attack) =>
    expect(() => validateCard({ ...input, attack })).toThrow(),
  );
  it("정수 경계와 선택 효과 허용", () => {
    expect(validateCard({ ...input, hp: 10, attack: 1000 }).hp).toBe(10);
  });
  it("이미지와 진영은 필수", () => {
    expect(() => validateCard({ ...input, image_key: "" })).toThrow();
    expect(() => validateCard({ ...input, faction_id: "" })).toThrow();
  });
  it("임의 효과와 문자열 boolean 거부", () => {
    expect(() =>
      validateCard({ ...input, passive_code: "anything" }),
    ).toThrow();
    expect(() => validateCard({ ...input, is_exodia: "false" })).toThrow();
  });
});
const cards = (normal: number, exodia = 5) =>
  Array.from({ length: normal + exodia }, (_, i) => ({
    id: String(i),
    is_exodia: i < exodia,
    review_status: "approved",
    is_usable: 1,
    archived: 0,
  }));
describe("진영 준비와 게임 덱", () => {
  it("19장 미달", () => expect(readiness(cards(14)).ready).toBe(false));
  it("20장 이상과 엑조디아 5장", () => {
    expect(readiness(cards(15)).ready).toBe(true);
    expect(readiness(cards(25)).ready).toBe(true);
    expect(readiness(cards(20, 4)).ready).toBe(false);
  });
  it("미승인 비활성 보관 카드는 제외", () => {
    const c = cards(15);
    c[0].review_status = "pending";
    expect(readiness(c).ready).toBe(false);
    c[0].review_status = "approved";
    c[0].is_usable = 0;
    expect(readiness(c).ready).toBe(false);
  });
  it("중복 없이 엑조디아 5장+일반 15장 선택", () => {
    const c = cards(25);
    const result = selectGameCards(c, () => 0.5);
    expect(result).toHaveLength(20);
    expect(result.filter((x) => x.is_exodia)).toHaveLength(5);
    expect(new Set(result.map((x) => x.id)).size).toBe(20);
    expect(c).toHaveLength(30);
  });
  it("준비 안 된 진영은 선택 거부", () =>
    expect(() => selectGameCards(cards(14))).toThrow());
});
