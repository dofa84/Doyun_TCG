import { useState, type FormEvent } from "react";
import { api, imageUrl, type Card, type Faction } from "../api";
import { rarities, passives, specials } from "../domain";
import { compressCardImage } from "../image-upload";
export function CardEditor({
  card,
  factions,
  onClose,
  onSaved,
}: {
  card: Card | null;
  factions: Faction[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [v, setV] = useState({
    name: card?.name ?? "",
    faction_id: card?.faction_id ?? factions[0]?.id ?? "",
    rarity: card?.rarity ?? "common",
    hp: card?.hp ?? 100,
    attack: card?.attack ?? 20,
    image_key: card?.image_key ?? "",
    is_exodia: !!card?.is_exodia,
    passive_code: card?.passive_code ?? "",
    special_attack_code: card?.special_attack_code ?? "",
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  function field(k: string, value: unknown) {
    setV((x) => ({ ...x, [k]: value }));
  }
  async function upload(file?: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const data = new FormData();
      data.set("file", await compressCardImage(file));
      field("image_key", (await api("/uploads/card-image", "POST", data)).key);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!v.image_key) {
      setError("카드 사진을 올려주세요.");
      return;
    }
    setBusy(true);
    try {
      await api(
        card ? "/cards/" + card.id : "/cards",
        card ? "PATCH" : "POST",
        {
          ...v,
          passive_code: v.passive_code || null,
          special_attack_code: v.special_attack_code || null,
          version: card?.version,
        },
      );
      onClose();
      await onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="overlay">
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="카드 편집"
      >
        <header>
          <div>
            <p className="eyebrow">CARD EDITOR</p>
            <h2>{card ? "카드 다듬기" : "새로운 카드 만들기"}</h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            disabled={busy}
            aria-label="닫기"
          >
            ✕
          </button>
        </header>
        <form onSubmit={save}>
          <div className="editor-layout">
            <div>
              <div className="image-upload">
                {v.image_key ? (
                  <img src={imageUrl(v.image_key)} alt="카드 이미지 미리보기" />
                ) : (
                  <div>
                    <span>＋</span>
                    <p>카드의 얼굴을 올려주세요</p>
                    <small>PNG · JPEG · WebP / 원본 최대 10 MiB</small>
                  </div>
                )}
              </div>
              <label className="upload-button">
                사진 선택
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={busy}
                  onChange={(e) => upload(e.target.files?.[0])}
                />
              </label>
              <p className="muted">사진은 최대 1200px · 512 KiB로 자동 압축해 저장합니다. 원본은 저장하지 않습니다.</p>
              <div className="preview-stats">
                <strong>{v.name || "이름 없는 영웅"}</strong>
                <span>
                  HP {v.hp.toLocaleString()} · ATK {v.attack.toLocaleString()}
                </span>
              </div>
            </div>
            <div className="fields">
              <label>
                카드 이름
                <input
                  required
                  maxLength={80}
                  value={v.name}
                  onChange={(e) => field("name", e.target.value)}
                  placeholder="예: 불꽃 기사"
                />
              </label>
              <div className="two-cols">
                <label>
                  진영
                  <select
                    required
                    value={v.faction_id}
                    onChange={(e) => field("faction_id", e.target.value)}
                  >
                    <option value="" disabled>
                      진영 선택
                    </option>
                    {factions.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  등급
                  <select
                    value={v.rarity}
                    onChange={(e) => field("rarity", e.target.value)}
                  >
                    {Object.entries(rarities).map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="two-cols">
                <label>
                  HP <small>10~10,000</small>
                  <input
                    type="number"
                    min={10}
                    max={10000}
                    step={1}
                    required
                    value={v.hp}
                    onChange={(e) => field("hp", Number(e.target.value))}
                  />
                </label>
                <label>
                  공격력 <small>1~1,000</small>
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    step={1}
                    required
                    value={v.attack}
                    onChange={(e) => field("attack", Number(e.target.value))}
                  />
                </label>
              </div>
              <label>
                패시브
                <select
                  value={v.passive_code}
                  onChange={(e) => field("passive_code", e.target.value)}
                >
                  <option value="">없음</option>
                  {Object.entries(passives).map(([k, p]) => (
                    <option key={k} value={k}>
                      {p.label} (
                      {p.type === "attack"
                        ? "공격형"
                        : p.type === "defense"
                          ? "방어형"
                          : "특수형"}
                      )
                    </option>
                  ))}
                </select>
                {v.passive_code && (
                  <small>
                    {
                      passives[v.passive_code as keyof typeof passives]
                        ?.description
                    }
                  </small>
                )}
              </label>
              <label>
                특수 공격
                <select
                  value={v.special_attack_code}
                  onChange={(e) => field("special_attack_code", e.target.value)}
                >
                  <option value="">없음</option>
                  {Object.entries(specials).map(([k, p]) => (
                    <option key={k} value={k}>
                      {p.label}
                    </option>
                  ))}
                </select>
                {v.special_attack_code && (
                  <small>
                    {
                      specials[v.special_attack_code as keyof typeof specials]
                        ?.description
                    }{" "}
                    · 카드당 1회
                  </small>
                )}
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={v.is_exodia}
                  onChange={(e) => field("is_exodia", e.target.checked)}
                />
                엑조디아 조각 <small>진영당 최대 5장</small>
              </label>
            </div>
          </div>
          {card?.review_status === "approved" && (
            <p className="notice">
              승인된 카드를 수정하면 사용이 중지되고 재심사를 받습니다.
            </p>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <footer>
            <button type="button" onClick={onClose} disabled={busy}>
              취소
            </button>
            <button className="primary" disabled={busy || !factions.length}>
              {busy ? "저장 중…" : "카드 저장"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
