import { useState } from "react";
import type { GameSession } from "../../game/api";
import type { GameAction, SnapshotCard } from "../../game/types";
import { imageUrl } from "../../api";
import { passives, specials } from "../../domain";
function Card({
  card,
  label,
  onDetail,
}: {
  card: SnapshotCard | null;
  label: string;
  onDetail: (c: SnapshotCard) => void;
}) {
  return (
    <div className="battle-slot">
      <span>{label}</span>
      {card ? (
        <button className="battle-card" onClick={() => onDetail(card)}>
          <img src={imageUrl(card.image_key)} alt={card.name} />
          <strong>{card.name}</strong>
          <span>
            HP {card.hp} / {card.max_hp}
          </span>
          <meter min={0} max={card.max_hp} value={card.hp} />
          <small>
            ATK {card.attack} · 특수{" "}
            {card.special_used ? "사용 완료" : "미사용"}
          </small>
          {card.passive_code && (
            <small>{passives[card.passive_code].label}</small>
          )}
        </button>
      ) : (
        <div className="battle-empty">빈 칸</div>
      )}
    </div>
  );
}
export function BattleBoard({
  game,
  busy,
  onAction,
}: {
  game: GameSession;
  busy: boolean;
  onAction: (action: GameAction) => void;
}) {
  const v = game.view!,
    [ack, setAck] = useState(""),
    [detail, setDetail] = useState<SnapshotCard | null>(null),
    stage = game.id + ":" + game.version;
  const actor = game.members[v.actor_seat];
  return (
    <section className="battle-board" data-version={game.version}>
      <header className="battle-status">
        <p className="eyebrow">TURN {v.turn} · SERVER VERIFIED</p>
        <h2>{v.winner !== null ? "대전 결과" : "대전 중"}</h2>
        <p>
          {v.winner !== null
            ? `${game.members[v.winner].email} 승리 · ${v.win_reason === "exodia" ? "엑조디아 완성" : "상대 전투 카드 전멸"}`
            : `${actor.email} · ${v.pending_attack ? "피해받을 카드 선택" : "행동 선택"}`}
        </p>
      </header>
      {[1, 0].map((n) => {
        const p = v.players[n],
          m = game.members[n];
        return (
          <section
            key={n}
            className={
              v.actor_seat === n ? "battle-player acting" : "battle-player"
            }
          >
            <h3>
              {n + 1}번 · {m.email}
            </h3>
            <p>
              {m.faction_name} · 덱 {p.deck_count} · 버림 {p.discard_count} ·
              사망 {p.dead.length}
            </p>
            <div className="battle-field">
              <Card
                card={p.slots.attack}
                label="공격 칸"
                onDetail={setDetail}
              />
              <Card
                card={p.slots.defense}
                label="방어 칸"
                onDetail={setDetail}
              />
            </div>
            <div
              className="exodia-track"
              aria-label={`${n + 1}번 엑조디아 ${p.waiting.length}장`}
            >
              {Array.from({ length: 5 }, (_, i) => (
                <span
                  key={i}
                  className={i < p.waiting.length ? "collected" : ""}
                >
                  {i < p.waiting.length ? "✦" : "◇"}
                </span>
              ))}
              <small>{p.waiting.length}/5</small>
            </div>
          </section>
        );
      })}
      {v.winner === null && ack !== stage ? (
        <section className="handoff">
          <strong>{actor.email}에게 기기를 넘겨주세요.</strong>
          <p>
            {v.pending_attack
              ? "내 공격·방어 카드 중 피해받을 카드를 선택합니다."
              : "카드 오픈 또는 공격 중 하나를 선택합니다."}
          </p>
          <button
            className="primary"
            disabled={busy}
            onClick={() => setAck(stage)}
          >
            기기를 넘겼어요
          </button>
        </section>
      ) : (
        <div className="battle-actions">
          {v.legal_actions.map((option, i) => (
            <button
              key={i}
              disabled={busy}
              className="primary"
              onClick={() => onAction(option.action)}
            >
              {option.label}
              {option.damage && (
                <small>
                  {" "}
                  · 예상 피해{" "}
                  {Object.entries(option.damage)
                    .map(
                      ([k, d]) => `${k === "attack" ? "공격" : "방어"} 칸 ${d}`,
                    )
                    .join(" / ")}
                </small>
              )}
            </button>
          ))}
        </div>
      )}
      {detail && (
        <div className="overlay">
          <section
            className="modal narrow"
            role="dialog"
            aria-modal="true"
            aria-label="전투 카드 상세"
          >
            <h2>{detail.name}</h2>
            <p>
              HP {detail.hp}/{detail.max_hp} · 공격력 {detail.attack}
            </p>
            <p>
              {detail.passive_code
                ? passives[detail.passive_code].description
                : "패시브 없음"}
            </p>
            <p>
              {detail.special_attack_code
                ? specials[detail.special_attack_code].description
                : "특수 공격 없음"}{" "}
              · {detail.special_used ? "사용 완료" : "사용 전"}
            </p>
            <button onClick={() => setDetail(null)}>닫기</button>
          </section>
        </div>
      )}
    </section>
  );
}
