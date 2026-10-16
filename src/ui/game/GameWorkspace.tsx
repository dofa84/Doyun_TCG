import { useState, useEffect, useRef } from "react";
import { api, type User, type Faction } from "../../api";
import { gameApi, GameHttpError, type GameSession } from "../../game/api";
import type { GameAction } from "../../game/types";
import { Lobby } from "./Lobby";
import { BattleBoard } from "./BattleBoard";
import "./game.css";
type Pending = { path: string; body: unknown };
type HistoryRow = {
  id: string;
  status: string;
  winner: number | null;
  turn_number: number;
};
export function GameWorkspace({
  user,
  onAccountChanged,
}: {
  user: User;
  onAccountChanged: (u: User) => void;
}) {
  const [id, setId] = useState(
      () => new URL(location.href).searchParams.get("game") ?? "",
    ),
    [game, setGame] = useState<GameSession | null>(null),
    [factions, setFactions] = useState<Faction[]>([]),
    [history, setHistory] = useState<HistoryRow[]>([]),
    [offset, setOffset] = useState(0),
    [nextOffset, setNextOffset] = useState<number | null>(null),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [pending, setPending] = useState<Pending | null>(null),
    [events, setEvents] = useState<
      { version: number; events: { text: string }[] }[]
    >([]);
  const generation = useRef(0);
  function select(next: string) {
    generation.current++;
    setGame(null);
    setEvents([]);
    setError("");
    setId(next);
    const url = new URL(location.href);
    if (next) url.searchParams.set("game", next);
    else url.searchParams.delete("game");
    window.history.replaceState(null, "", url);
  }
  async function refresh() {
    const epoch = ++generation.current;
    setLoading(true);
    try {
      const [fs, list, g] = await Promise.all([
        api<Faction[]>("/factions"),
        gameApi<{ games: HistoryRow[]; next_offset: number | null }>(
          `/games?offset=${offset}`,
        ),
        id ? gameApi(`/games/${id}`) : Promise.resolve(null),
      ]);
      if (epoch !== generation.current) return;
      setFactions(fs);
      setHistory(list.games);
      setNextOffset(list.next_offset);
      setGame(g);
      if (g && g.status !== "waiting") {
        const log = await gameApi<{ events: typeof events }>(
          `/games/${id}/events`,
        );
        if (epoch === generation.current) setEvents(log.events);
      }
    } catch (e) {
      if (epoch === generation.current) setError((e as Error).message);
    } finally {
      if (epoch === generation.current) setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
    return () => {
      generation.current++;
    };
  }, [id, offset]);
  async function mutate(path: string, body: unknown) {
    const op = { path, body };
    setPending(op);
    setBusy(true);
    setError("");
    const epoch = ++generation.current;
    try {
      const result = await gameApi(path, "POST", body);
      if (epoch !== generation.current) return;
      setPending(null);
      if (result.id !== id) select(result.id);
      setGame(result);
      setLoading(false);
      const log =
        result.status !== "waiting"
          ? await gameApi<{ events: typeof events }>(
              `/games/${result.id}/events`,
            )
          : null;
      if (log && epoch === generation.current) setEvents(log.events);
    } catch (e) {
      if (epoch !== generation.current) return;
      if (e instanceof GameHttpError && e.status < 500) {
        setPending(null);
        if (e.status === 409) {
          await refresh();
        }
        setError(e.message);
      } else
        setError(
          "서버 처리 여부를 확인하지 못했습니다. 같은 요청으로 다시 확인해주세요.",
        );
    } finally {
      setBusy(false);
    }
  }
  function action(action: GameAction) {
    if (game)
      void mutate(`/games/${game.id}/actions`, {
        request_id: crypto.randomUUID(),
        expected_version: game.version,
        actor_seat: game.view!.actor_seat,
        action,
      });
  }
  const disabled = busy || pending !== null;
  return (
    <div className="game-workspace">
      <div className="game-toolbar">
        <button disabled={disabled} onClick={() => select("")}>
          대전 목록
        </button>
        <button disabled={disabled} onClick={() => void refresh()}>
          상태 새로고침
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {pending && !busy && (
        <button
          className="primary"
          onClick={() => void mutate(pending.path, pending.body)}
        >
          같은 요청 다시 확인
        </button>
      )}
      {loading && !game ? (
        <p>대전 정보를 불러오는 중…</p>
      ) : game?.view && game.device_ready ? (
        <BattleBoard game={game} busy={disabled} onAction={action} />
      ) : (
        (!id || game) && (
          <Lobby
            user={user}
            game={game}
            factions={factions}
            busy={disabled}
            onAccountChanged={onAccountChanged}
            mutate={mutate}
            onError={setError}
          />
        )
      )}
      {!id && (
        <section className="game-history">
          <h2>내 대전 기록</h2>
          {history.length ? (
            history.map((g) => (
              <button
                key={g.id}
                disabled={disabled}
                onClick={() => select(g.id)}
              >
                {g.status === "waiting"
                  ? "참가 대기"
                  : g.status === "finished"
                    ? "종료"
                    : "진행 중"}{" "}
                · {g.turn_number}턴 · {g.id.slice(0, 8)}
              </button>
            ))
          ) : (
            <p className="muted">아직 대전 기록이 없습니다.</p>
          )}
          <div>
            {offset > 0 && (
              <button onClick={() => setOffset(Math.max(0, offset - 50))}>
                이전 기록
              </button>
            )}
            {nextOffset !== null && (
              <button onClick={() => setOffset(nextOffset)}>다음 기록</button>
            )}
          </div>
        </section>
      )}
      {events.length > 0 && (
        <details className="battle-log">
          <summary>공개 전투 기록</summary>
          {events.flatMap((r) =>
            r.events.map((e, i) => (
              <p key={r.version + ":" + i}>
                #{r.version} {e.text}
              </p>
            )),
          )}
          <p className="fine">
            최근 조회 구간 최대 50개 행동입니다. 비공개 카드 이름은 기록하지
            않습니다.
          </p>
        </details>
      )}
    </div>
  );
}
