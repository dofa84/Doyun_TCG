import { useState, type FormEvent } from "react";
import { api, type User, type Faction } from "../../api";
import type { GameSession } from "../../game/api";
export function Lobby({
  user,
  game,
  factions,
  busy,
  onAccountChanged,
  mutate,
  onError,
}: {
  user: User;
  game: GameSession | null;
  factions: Faction[];
  busy: boolean;
  onAccountChanged: (u: User) => void;
  mutate: (path: string, body: unknown) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [faction, setFaction] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [logging, setLogging] = useState(false);
  const disabled = busy || logging;
  async function login(e: FormEvent) {
    e.preventDefault();
    setLogging(true);
    onError("");
    try {
      const r = await api<{ user: User }>("/auth/login", "POST", {
        email,
        password,
      });
      setPassword("");
      onAccountChanged(r.user);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setLogging(false);
    }
  }
  const same = game?.members[0]?.user_id === user.id;
  const recovery =
    game &&
    game.status !== "finished" &&
    (game.status === "waiting"
      ? same && !game.authorized_seats[0]
      : !game.device_ready);
  return (
    <section className="battle-lobby">
      <h2>
        {recovery
          ? "대전 기기 다시 인증"
          : game
            ? "두 번째 플레이어 참가"
            : "새 대전 준비"}
      </h2>
      <p>
        현재 계정: <strong>{user.email}</strong>
      </p>
      {game && (
        <p>
          {game.members
            .map((m) => `${m.seat + 1}번 ${m.email} · ${m.faction_name}`)
            .join(" / ")}
        </p>
      )}
      {recovery ? (
        <>
          <p>
            두 참가자가 각각 다시 로그인하고 이 기기를 인증해주세요. 게임은
            저장되어 있습니다.
          </p>
          <p>
            {game.members
              .map(
                (m) =>
                  `${m.email}: ${game.authorized_seats[m.seat] ? "인증 완료" : "인증 필요"}`,
              )
              .join(" / ")}
          </p>
          <button
            disabled={disabled}
            className="primary"
            onClick={() =>
              void mutate(`/games/${game.id}/device-authorizations`, {})
            }
          >
            이 계정 인증
          </button>
        </>
      ) : (
        (!game || !same) && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void mutate(game ? `/games/${game.id}/join` : "/games", {
                faction_id: faction,
                request_id: crypto.randomUUID(),
                ...(game ? { expected_version: game.version } : {}),
              });
            }}
          >
            <label>
              출전 진영
              <select
                required
                aria-label="출전 진영"
                disabled={disabled}
                value={faction}
                onChange={(e) => setFaction(e.target.value)}
              >
                <option value="">진영 선택</option>
                {factions.map((f) => (
                  <option key={f.id} value={f.id} disabled={!f.readiness.ready}>
                    {f.name} · {f.readiness.total}장 / 엑조디아{" "}
                    {f.readiness.exodia}/5
                    {f.readiness.ready ? "" : " (준비 부족)"}
                  </option>
                ))}
              </select>
            </label>
            <p className="fine">
              승인·활성 20장 이상, 엑조디아 5장 필수. 게임당 5장 + 랜덤 15장.
            </p>
            <button className="primary" disabled={disabled || !faction}>
              {game ? "이 계정으로 참가" : "대기방 만들기"}
            </button>
          </form>
        )
      )}
      {game && (same || recovery) && (
        <form onSubmit={login} className="account-switch">
          <h3>{recovery ? "다른 참가자 로그인" : "다른 계정으로 참가"}</h3>
          <p>
            로그아웃하지 않고 계정을 전환합니다. 같은 계정으로는 참가할 수
            없습니다.
          </p>
          <label>
            참가자 아이디 또는 이메일
            <input
              autoComplete="username"
              required
              maxLength={254}
              value={email}
              disabled={disabled}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            참가자 비밀번호
            <input
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
              value={password}
              disabled={disabled}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button disabled={disabled}>계정 전환</button>
        </form>
      )}
    </section>
  );
}
