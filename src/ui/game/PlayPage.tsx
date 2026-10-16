import { useState } from "react";
import { api, type User } from "../../api";
import { GameWorkspace } from "./GameWorkspace";
import "./game.css";

export function PlayPage({
  user,
  onLogout,
  onAccountChanged,
}: {
  user: User;
  onLogout: () => void;
  onAccountChanged: (user: User) => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function logout() {
    setBusy(true);
    setError("");
    try {
      await api("/auth/logout", "POST", {});
      onLogout();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="play-page">
      <header className="play-header">
        <strong>
          DOYUN TCG <span>PLAY</span>
        </strong>
        <button disabled={busy} onClick={() => void logout()}>
          로그아웃
        </button>
      </header>
      <main className="play-content">
        <h1>진영을 선택하고 대전하세요</h1>
        <p className="muted">
          두 계정으로 로그인하고, 한 기기에서 번갈아 플레이합니다.
        </p>
        <p className="play-account">현재 계정 · {user.email}</p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <GameWorkspace user={user} onAccountChanged={onAccountChanged} />
      </main>
      <footer className="play-footer">
        <a href="/">카드 제작·관리로 이동</a>
      </footer>
    </div>
  );
}
