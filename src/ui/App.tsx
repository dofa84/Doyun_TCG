import { useEffect, useState, useRef } from "react";
import {
  api,
  imageUrl,
  statusLabel,
  type Card,
  type Faction,
  type User,
} from "../api";
import { Login } from "./Login";
import { CardEditor } from "./CardEditor";
import { rarities, passives, specials } from "../domain";
type Tab = "dashboard" | "cards" | "factions" | "review" | "balance";
export function App() {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    api("/auth/me")
      .then((r) => {
        if (active) setUser(r.user);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  if (loading) return <div className="loading">카드 공방을 여는 중…</div>;
  if (!user) return <Login onLogin={setUser} />;
  return <Workspace key={user.id} user={user} onLogout={() => setUser(null)} />;
}
function Workspace({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [cards, setCards] = useState<Card[]>([]),
    [factions, setFactions] = useState<Faction[]>([]),
    [tab, setTab] = useState<Tab>("dashboard"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [editor, setEditor] = useState<Card | null | undefined>(),
    [detail, setDetail] = useState<Card | null>(null),
    [audit, setAudit] = useState<any[]>([]),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [factionForm, setFactionForm] = useState<{
      id?: string;
      name: string;
      description: string;
    } | null>(null),
    [reason, setReason] = useState(""),
    [confirmArchive, setConfirmArchive] = useState(false);
  const selection = useRef(0),
    listRequest = useRef(0);
  function closeDetail() {
    selection.current++;
    setDetail(null);
    setAudit([]);
  }
  async function refresh() {
    const request = ++listRequest.current;
    const [cs, fs] = await Promise.all([
      api<Card[]>("/cards"),
      api<Faction[]>("/factions"),
    ]);
    if (request !== listRequest.current) return;
    setCards(cs);
    setFactions(fs);
  }
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, []);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function action(c: Card, a: string) {
    const epoch = selection.current;
    await run(async () => {
      await api(
        a === "archive"
          ? "/cards/" + c.id
          : a === "submit"
            ? "/cards/" + c.id + "/submit"
            : "/admin/cards/" + c.id + "/" + a,
        a === "archive" ? "DELETE" : "POST",
        { version: c.version, reason },
      );
      if (epoch !== selection.current) return;
      if (a === "archive") closeDetail();
      else {
        const [updated, history] = await Promise.all([
          api("/cards/" + c.id),
          api("/cards/" + c.id + "/audit"),
        ]);
        if (epoch !== selection.current) return;
        setDetail(updated);
        setAudit(history);
      }
      setConfirmArchive(false);
    });
  }
  async function open(c: Card) {
    const epoch = ++selection.current;
    setDetail(c);
    setReason("");
    setAudit([]);
    setConfirmArchive(false);
    if (c.owner_user_id === user?.id || user?.role === "admin")
      try {
        const history = await api("/cards/" + c.id + "/audit");
        if (epoch === selection.current) setAudit(history);
      } catch (e) {
        setError((e as Error).message);
      }
  }
  const own = cards.filter((c) => c.owner_user_id === user.id),
    pending = cards.filter((c) => c.review_status === "pending"),
    ready = factions.filter((f) => f.readiness.ready);
  const tabs: { id: Tab; icon: string; label: string }[] = [
    { id: "dashboard", icon: "▦", label: "작업실" },
    { id: "cards", icon: "▤", label: "카드 도감" },
    { id: "factions", icon: "⚑", label: "진영 관리" },
    { id: "balance", icon: "▥", label: "수치 비교" },
    ...(user.role === "admin"
      ? [{ id: "review" as Tab, icon: "✓", label: "검수 대기" }]
      : []),
  ];
  const shown = cards.filter(
    (c) =>
      (tab !== "review" || c.review_status === "pending") &&
      (filter === "all" ||
        (filter === "mine" && c.owner_user_id === user.id) ||
        filter === c.review_status) &&
      (c.name + " " + c.faction_name)
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          D<span>✦</span>TCG<small>CARD WORKSHOP</small>
        </div>
        <p className="nav-label">WORKSPACE</p>
        <nav>
          {tabs.map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? "selected" : ""}
              onClick={() => {
                setTab(t.id);
                setFilter("all");
                setSearch("");
              }}
            >
              <span>{t.icon}</span>
              {t.label}
              {t.id === "review" && pending.length > 0 && (
                <b>{pending.length}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="avatar">{user.email[0].toUpperCase()}</span>
          <div>
            <strong>{user.role === "admin" ? "관리자" : "카드 제작자"}</strong>
            <small>{user.email}</small>
          </div>
          <button
            aria-label="로그아웃"
            title="로그아웃"
            onClick={() =>
              api("/auth/logout", "POST", {})
                .then(onLogout)
                .catch((e) => setError(e.message))
            }
          >
            ↗
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>
            DOYUN TCG <i>/</i> {tabs.find((t) => t.id === tab)?.label}
          </span>
          <span className="topbar-badge">✦ 나만의 카드 세계</span>
        </header>
        <main className="content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {tab === "dashboard"
                  ? "THE WORKSHOP"
                  : tab === "review"
                    ? "REVIEW QUEUE"
                    : "YOUR COLLECTION"}
              </p>
              <h1>
                {tab === "dashboard"
                  ? "오늘은 어떤 영웅을 만들까요?"
                  : tab === "cards"
                    ? "카드 도감"
                    : tab === "factions"
                      ? "함께 만드는 진영"
                      : tab === "balance"
                        ? "카드 수치 비교"
                        : "출전을 기다리는 카드"}
              </h1>
              <p className="muted">
                {tab === "dashboard"
                  ? "한 장씩 채워가는 우리만의 카드 게임."
                  : tab === "factions"
                    ? "승인·활성 카드 20장 이상, 엑조디아 5장이 모이면 출전 준비 완료."
                    : tab === "balance"
                      ? "HP와 공격력을 비교합니다. 실제 승률은 전투 기록이 생긴 뒤 확인할 수 있습니다."
                      : "카드를 만들고, 다듬고, 전투를 준비하세요."}
              </p>
            </div>
            {tab === "factions" ? (
              <button
                className="primary"
                onClick={() => setFactionForm({ name: "", description: "" })}
              >
                ＋ 진영 만들기
              </button>
            ) : (
              <button
                className="primary"
                onClick={() => {
                  if (!factions.length) {
                    setTab("factions");
                    setFactionForm({ name: "", description: "" });
                  } else setEditor(null);
                }}
              >
                ＋ 카드 만들기
              </button>
            )}
          </div>
          {error && (
            <div className="error" role="alert">
              {error}
              <button className="text-button" onClick={() => setError("")}>
                닫기
              </button>
            </div>
          )}
          {tab === "dashboard" && (
            <>
              <section className="stats">
                <div>
                  <span>내가 만든 카드</span>
                  <strong>
                    {own.length}
                    <small>장</small>
                  </strong>
                  <p>상상에서 탄생한 영웅들</p>
                </div>
                <div>
                  <span>심사 대기</span>
                  <strong>
                    {
                      (user.role === "admin"
                        ? pending
                        : own.filter((c) => c.review_status === "pending")
                      ).length
                    }
                    <small>장</small>
                  </strong>
                  <p>승인을 기다리고 있어요</p>
                </div>
                <div>
                  <span>출전 가능한 진영</span>
                  <strong>
                    {ready.length}
                    <small>/ {factions.length}</small>
                  </strong>
                  <p>20장 + 엑조디아 5장</p>
                </div>
              </section>
              <section className="hero-banner">
                <div>
                  <p className="eyebrow">BUILD YOUR NEXT HERO</p>
                  <h2>
                    작은 아이디어가
                    <br />
                    다음 전투의 주인공이 됩니다.
                  </h2>
                  <p>사진 한 장에 이름과 능력을 더해보세요.</p>
                  <button
                    onClick={() =>
                      factions.length ? setEditor(null) : setTab("factions")
                    }
                  >
                    새 카드 제작하기 ↗
                  </button>
                </div>
                <div className="banner-emblem">
                  ✦<small>CREATE · COLLECT · PLAY</small>
                </div>
              </section>
              <div className="section-heading">
                <h2>
                  최근 만든 카드 <small>{cards.length}</small>
                </h2>
                <button className="text-button" onClick={() => setTab("cards")}>
                  전체 보기 →
                </button>
              </div>
            </>
          )}
          {(tab === "cards" || tab === "review") && (
            <div className="toolbar">
              <input
                aria-label="카드 검색"
                placeholder="이름 또는 진영으로 검색"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {tab === "cards" && (
                <select
                  aria-label="카드 상태 필터"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="all">모든 카드</option>
                  <option value="mine">내 카드</option>
                  {Object.entries(statusLabel).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
              )}
              <span>{shown.length}장의 카드</span>
            </div>
          )}
          {(tab === "dashboard" || tab === "cards" || tab === "review") &&
            ((tab === "dashboard" ? cards.slice(0, 8) : shown).length ? (
              <section className="card-grid">
                {(tab === "dashboard" ? cards.slice(0, 8) : shown).map((c) => (
                  <button
                    className={"tcg-card " + c.rarity}
                    key={c.id}
                    onClick={() => open(c)}
                  >
                    <div className="card-art">
                      <img
                        src={imageUrl(c.image_key)}
                        alt={c.name}
                        loading="lazy"
                      />
                      <span className="rarity">
                        {c.is_exodia ? "✦ 엑조디아" : rarities[c.rarity]}
                      </span>
                      <span className={"status " + c.review_status}>
                        {statusLabel[c.review_status]}
                      </span>
                    </div>
                    <div className="card-info">
                      <small>{c.faction_name}</small>
                      <h3>{c.name}</h3>
                      <div className="card-values">
                        <span>
                          <i>HP</i> {c.hp.toLocaleString()}
                        </span>
                        <span>
                          <i>ATK</i> {c.attack.toLocaleString()}
                        </span>
                      </div>
                      <footer>
                        {c.is_usable ? "● 사용 가능" : "○ 출전 준비 중"}
                        <span>↗</span>
                      </footer>
                    </div>
                  </button>
                ))}
              </section>
            ) : (
              <section className="empty">
                <div>▤</div>
                <h2>
                  {tab === "review"
                    ? "대기 중인 카드가 없습니다"
                    : "아직 카드가 없어요"}
                </h2>
                <p>
                  {tab === "review"
                    ? "제작자가 심사를 요청하면 이곳에 표시됩니다."
                    : "진영을 선택하고 첫 번째 영웅을 만들어보세요."}
                </p>
                <button
                  onClick={() =>
                    factions.length ? setEditor(null) : setTab("factions")
                  }
                >
                  {factions.length ? "첫 카드 만들기" : "진영부터 만들기"} →
                </button>
              </section>
            ))}
          {tab === "factions" && (
            <section className="faction-grid">
              {factions.length ? (
                factions.map((f) => (
                  <article className="faction-card" key={f.id}>
                    <span
                      className={
                        "ready-tag " + (f.readiness.ready ? "ready" : "")
                      }
                    >
                      {f.readiness.ready ? "● 출전 가능" : "○ 준비 중"}
                    </span>
                    <h2>{f.name}</h2>
                    <p>{f.description || "이 진영의 이야기를 써주세요."}</p>
                    <div className="faction-numbers">
                      <div>
                        <strong>
                          {f.readiness.total}
                          <small>/20+</small>
                        </strong>
                        <span>승인·활성 카드</span>
                      </div>
                      <div>
                        <strong>
                          {f.readiness.exodia}
                          <small>/5</small>
                        </strong>
                        <span>엑조디아 조각</span>
                      </div>
                    </div>
                    <div className="progress">
                      <span
                        style={{
                          width:
                            Math.min((f.readiness.total / 20) * 100, 100) + "%",
                        }}
                      />
                    </div>
                    <footer>
                      <small>
                        일반 카드 {f.readiness.normal}장 · 게임당 15장 랜덤
                      </small>
                      {(f.owner_user_id === user.id ||
                        user.role === "admin") && (
                        <button
                          onClick={() =>
                            setFactionForm({
                              id: f.id,
                              name: f.name,
                              description: f.description,
                            })
                          }
                        >
                          수정
                        </button>
                      )}
                    </footer>
                  </article>
                ))
              ) : (
                <div className="empty">
                  <h2>첫 진영을 만들어주세요</h2>
                  <p>카드는 진영에 소속되어야 합니다.</p>
                </div>
              )}
            </section>
          )}
          {tab === "balance" && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>카드</th>
                    <th>진영</th>
                    <th>등급</th>
                    <th>HP</th>
                    <th>공격력</th>
                    <th>HP ÷ 공격력</th>
                    <th>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {cards
                    .filter((c) => !c.is_exodia)
                    .sort((a, b) => b.attack - a.attack)
                    .map((c) => (
                      <tr key={c.id}>
                        <td>
                          <button
                            className="text-button"
                            onClick={() => open(c)}
                          >
                            {c.name}
                          </button>
                        </td>
                        <td>{c.faction_name}</td>
                        <td>{rarities[c.rarity]}</td>
                        <td>{c.hp.toLocaleString()}</td>
                        <td>{c.attack.toLocaleString()}</td>
                        <td>{(c.hp / c.attack).toFixed(1)}</td>
                        <td>{statusLabel[c.review_status]}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {!cards.length && (
                <p className="empty">비교할 카드가 없습니다.</p>
              )}
              <p className="fine">
                HP ÷ 공격력은 수치 비교용입니다. 패시브·상성·승률을 반영한 강함
                점수가 아닙니다.
              </p>
            </div>
          )}
          <footer className="page-footer">
            DOYUN TCG <span>한 장씩, 우리만의 세계를.</span>
          </footer>
        </main>
      </div>
      {editor !== undefined && (
        <CardEditor
          card={editor}
          factions={factions}
          onClose={() => setEditor(undefined)}
          onSaved={() => run(async () => {})}
        />
      )}
      {factionForm && (
        <div className="overlay">
          <section
            className="modal narrow"
            role="dialog"
            aria-modal="true"
            aria-label="진영 편집"
          >
            <h2>{factionForm.id ? "진영 수정" : "새 진영 만들기"}</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  await api(
                    "/factions" + (factionForm.id ? "/" + factionForm.id : ""),
                    factionForm.id ? "PATCH" : "POST",
                    factionForm,
                  );
                  setFactionForm(null);
                });
              }}
            >
              <label>
                진영 이름
                <input
                  required
                  maxLength={60}
                  value={factionForm.name}
                  onChange={(e) =>
                    setFactionForm({ ...factionForm, name: e.target.value })
                  }
                />
              </label>
              <label>
                진영 설명
                <textarea
                  maxLength={500}
                  value={factionForm.description}
                  onChange={(e) =>
                    setFactionForm({
                      ...factionForm,
                      description: e.target.value,
                    })
                  }
                />
              </label>
              <footer>
                <button type="button" onClick={() => setFactionForm(null)}>
                  취소
                </button>
                <button className="primary" disabled={busy}>
                  저장
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
      {detail && (
        <div className="overlay">
          <section
            className="modal narrow"
            role="dialog"
            aria-modal="true"
            aria-label="카드 상세"
          >
            <header>
              <h2>{detail.name}</h2>
              <button
                aria-label="닫기"
                className="icon-button"
                onClick={closeDetail}
              >
                ✕
              </button>
            </header>
            <img
              className="detail-image"
              src={imageUrl(detail.image_key)}
              alt={detail.name}
            />
            <p>
              {detail.faction_name} · {rarities[detail.rarity]} ·{" "}
              {statusLabel[detail.review_status]} ·{" "}
              {detail.is_usable ? "사용 가능" : "사용 중지"}
            </p>
            <div className="detail-values">
              <strong>HP {detail.hp.toLocaleString()}</strong>
              <strong>ATK {detail.attack.toLocaleString()}</strong>
            </div>
            {detail.passive_code && (
              <p>
                패시브 ·{" "}
                {passives[detail.passive_code as keyof typeof passives]?.label}
              </p>
            )}
            {detail.special_attack_code && (
              <p>
                특수 공격 ·{" "}
                {
                  specials[detail.special_attack_code as keyof typeof specials]
                    ?.label
                }
              </p>
            )}
            {detail.rejection_reason && (
              <p className="error">반려 사유: {detail.rejection_reason}</p>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="detail-actions">
              {detail.owner_user_id === user.id && (
                <>
                  <button
                    disabled={busy}
                    onClick={() => {
                      setEditor(detail);
                      closeDetail();
                    }}
                  >
                    카드 수정
                  </button>
                  {["draft", "rejected"].includes(detail.review_status) && (
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() => action(detail, "submit")}
                    >
                      심사 요청
                    </button>
                  )}
                </>
              )}
              {(detail.owner_user_id === user.id || user.role === "admin") && (
                <button
                  className="danger"
                  disabled={busy}
                  onClick={() => setConfirmArchive(true)}
                >
                  보관
                </button>
              )}
              {user.role === "admin" && detail.review_status === "pending" && (
                <>
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => action(detail, "approve")}
                  >
                    승인
                  </button>
                  <input
                    aria-label="반려 사유"
                    placeholder="반려 사유 입력"
                    maxLength={500}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <button
                    disabled={busy || !reason.trim()}
                    onClick={() => action(detail, "reject")}
                  >
                    반려
                  </button>
                </>
              )}
              {user.role === "admin" && detail.review_status === "approved" && (
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    action(detail, detail.is_usable ? "disable" : "enable")
                  }
                >
                  {detail.is_usable ? "사용 중지" : "사용 활성화"}
                </button>
              )}
            </div>
            {confirmArchive && (
              <div className="notice">
                <p>
                  보관하면 카드 목록과 게임 후보에서 제외됩니다. 기록은
                  유지됩니다.
                </p>
                <button
                  disabled={busy}
                  onClick={() => action(detail, "archive")}
                >
                  보관 확정
                </button>
                <button onClick={() => setConfirmArchive(false)}>취소</button>
              </div>
            )}
            {audit.length > 0 && (
              <details>
                <summary>변경 기록 ({audit.length})</summary>
                {audit.map((a, i) => (
                  <p className="fine" key={i}>
                    v{a.card_version} · {a.action} · {a.to_status} ·{" "}
                    {a.created_at}
                    {a.reason ? " · " + a.reason : ""}
                  </p>
                ))}
              </details>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
