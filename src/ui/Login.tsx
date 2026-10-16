import { useState, type FormEvent } from "react";
import { api, type User } from "../api";
export function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login"),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      onLogin((await api("/auth/" + mode, "POST", { email, password })).user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login">
      <section className="login-story">
        <div className="brand">
          D<span>✦</span>TCG <small>CARD WORKSHOP</small>
        </div>
        <div className="story-copy">
          <p className="eyebrow">YOUR CARDS. YOUR UNIVERSE.</p>
          <h1>
            상상한 영웅을,
            <br />
            <em>한 장의 카드로.</em>
          </h1>
          <p>
            직접 만들고, 다듬고, 전투를 준비하세요.
            <br />
            도윤이와 함께 만드는 작은 카드 세계.
          </p>
        </div>
        <div className="abstract-card">
          <span>DOYUN / 001</span>
          <div>✦</div>
          <strong>THE BEGINNING</strong>
          <small>모든 모험은 한 장에서 시작된다</small>
        </div>
        <footer>DOYUN TCG · 카드 제작실</footer>
      </section>
      <section className="login-panel">
        <div className="login-box">
          <p className="eyebrow">WELCOME TO THE WORKSHOP</p>
          <h2>
            {mode === "login"
              ? "카드 공방에 들어가기"
              : "나만의 카드 제작 시작"}
          </h2>
          <p className="muted">내 카드와 진영을 관리하는 공간입니다.</p>
          <form onSubmit={submit}>
            <label>
              {mode === "login" ? "아이디 또는 이메일" : "이메일"}
              <input
                type={mode === "login" ? "text" : "email"}
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={254}
                placeholder={
                  mode === "login"
                    ? "아이디 또는 이메일 입력"
                    : "you@example.com"
                }
              />
            </label>
            <label>
              비밀번호
              <input
                type="password"
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                minLength={mode === "register" ? 12 : undefined}
                maxLength={128}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={
                  mode === "register"
                    ? "12자 이상 입력해주세요"
                    : "비밀번호 입력"
                }
              />
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="primary wide" disabled={busy}>
              {busy
                ? "확인 중…"
                : mode === "login"
                  ? "로그인 →"
                  : "계정 만들기 →"}
            </button>
          </form>
          <button
            className="text-button"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError("");
            }}
          >
            {mode === "login"
              ? "처음 오셨나요? 회원가입"
              : "이미 계정이 있나요? 로그인"}
          </button>
          <p className="fine">
            가입 계정은 일반 제작자입니다. 관리자 권한은 운영자가 지정합니다.
          </p>
        </div>
      </section>
    </main>
  );
}
