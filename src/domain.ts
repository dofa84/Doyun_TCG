export const rarities = {
  legendary: "전설",
  hero: "영웅",
  rare: "레어",
  common: "일반",
} as const;
export const passives = {
  fury: {
    label: "맹공",
    type: "attack",
    description: "방어 칸에 있을 때 아군 공격 카드의 피해 공격력 +10%",
  },
  armor: {
    label: "철갑",
    type: "defense",
    description: "방어 칸에서 자신이 받는 일반 공격 피해 -10%",
  },
  regeneration: {
    label: "재생",
    type: "special",
    description: "방어 칸에서 자기 턴 시작 시 최대 HP의 5% 회복, 게임당 3회",
  },
} as const;
export const specials = {
  power_strike: {
    label: "강타",
    description: "일반 공격 대신 기본 공격력의 150% 피해",
  },
  heal: {
    label: "회복",
    description: "일반 공격 대신 자기 최대 HP의 25% 회복",
  },
  pierce: {
    label: "관통",
    description: "일반 공격 대신 방어형 패시브를 무시한 기본 공격 피해",
  },
} as const;
export type CardInput = {
  name: string;
  faction_id: string;
  rarity: keyof typeof rarities;
  hp: number;
  attack: number;
  image_key: string;
  is_exodia: boolean;
  passive_code: keyof typeof passives | null;
  special_attack_code: keyof typeof specials | null;
};
export type GameCard = {
  id: string;
  is_exodia: boolean | number;
  review_status: string;
  is_usable: number | boolean;
  archived: number | boolean;
};
export function validateCard(raw: unknown): CardInput {
  if (!raw || typeof raw !== "object")
    throw new Error("카드 정보를 확인해주세요.");
  const v = raw as Record<string, unknown>;
  for (const key of ["name", "faction_id", "image_key"])
    if (
      typeof v[key] !== "string" ||
      !v[key].trim() ||
      v[key].length > (key === "name" ? 80 : 200)
    )
      throw new Error("이름, 진영, 이미지는 필수입니다.");
  if (typeof v.rarity !== "string" || !Object.hasOwn(rarities, v.rarity))
    throw new Error("등급을 선택해주세요.");
  if (!Number.isInteger(v.hp) || Number(v.hp) < 10 || Number(v.hp) > 10000)
    throw new Error("HP는 10~10,000 정수입니다.");
  if (
    !Number.isInteger(v.attack) ||
    Number(v.attack) < 1 ||
    Number(v.attack) > 1000
  )
    throw new Error("공격력은 1~1,000 정수입니다.");
  if (typeof v.is_exodia !== "boolean")
    throw new Error("엑조디아 여부를 확인해주세요.");
  if (
    v.passive_code != null &&
    (typeof v.passive_code !== "string" ||
      !Object.hasOwn(passives, v.passive_code))
  )
    throw new Error("지원하지 않는 패시브입니다.");
  if (
    v.special_attack_code != null &&
    (typeof v.special_attack_code !== "string" ||
      !Object.hasOwn(specials, v.special_attack_code))
  )
    throw new Error("지원하지 않는 특수 공격입니다.");
  return {
    name: String(v.name).trim(),
    faction_id: String(v.faction_id),
    rarity: v.rarity as CardInput["rarity"],
    hp: Number(v.hp),
    attack: Number(v.attack),
    image_key: String(v.image_key),
    is_exodia: v.is_exodia,
    passive_code: (v.passive_code ?? null) as CardInput["passive_code"],
    special_attack_code: (v.special_attack_code ??
      null) as CardInput["special_attack_code"],
  };
}
export function readiness(cards: GameCard[]) {
  const usable = cards.filter(
    (c) => c.review_status === "approved" && c.is_usable && !c.archived,
  );
  const exodia = usable.filter((c) => c.is_exodia).length,
    normal = usable.length - exodia;
  return {
    total: usable.length,
    exodia,
    normal,
    ready: exodia === 5 && normal >= 15,
  };
}
export function selectGameCards<T extends GameCard>(
  cards: T[],
  random = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296,
): T[] {
  if (!readiness(cards).ready) throw new Error("진영이 준비되지 않았습니다.");
  const usable = cards.filter(
      (c) => c.review_status === "approved" && c.is_usable && !c.archived,
    ),
    normal = usable.filter((c) => !c.is_exodia);
  for (let i = normal.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [normal[i], normal[j]] = [normal[j], normal[i]];
  }
  return [...usable.filter((c) => c.is_exodia), ...normal.slice(0, 15)];
}
