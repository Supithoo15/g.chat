import { useState } from 'react';
import { api, ApiError } from '../api';
import type { User } from '../types';

type Props = {
  onAuthed: (user: User) => void;
};

const FEATURES = [
  { icon: '🎭', title: '이미 만들어진 테마챗', text: '로맨스·판타지·사극·SF까지 10명의 캐릭터와 바로 대화' },
  { icon: '🛠️', title: '나만의 캐릭터 제작', text: '이름, 말투, 첫 인사, 테마 색까지 직접 설정' },
  { icon: '💾', title: '대화가 그대로 저장', text: '로그인하면 캐릭터별 대화 기록이 계속 이어집니다' },
];

export default function AuthScreen({ onAuthed }: Props) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<{ user: User }>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fn();
      onAuthed(res.user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '잠시 후 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (mode === 'login') {
      void run(() => api.login(email.trim(), password));
    } else {
      void run(() => api.signup(email.trim(), username.trim(), password));
    }
  }

  return (
    <div className="auth">
      <section className="auth-hero">
        <div className="brand brand-lg">
          <span className="brand-mark">G</span>
          <span className="brand-name">
            G<span className="brand-dot">.</span>CHAT
          </span>
        </div>
        <p className="auth-headline">
          취향에 맞는 <span className="grad">테마 캐릭터</span>와
          <br />
          지금 바로 대화를 시작하세요.
        </p>
        <p className="auth-sub">
          G.CHAT은 감정선이 살아있는 AI 캐릭터 채팅 공간입니다. 준비된 테마챗을 골라도 되고,
          직접 캐릭터를 만들어도 됩니다.
        </p>
        <ul className="feature-list">
          {FEATURES.map((feature) => (
            <li key={feature.title}>
              <span className="feature-icon">{feature.icon}</span>
              <span>
                <strong>{feature.title}</strong>
                <em>{feature.text}</em>
              </span>
            </li>
          ))}
        </ul>
        <div className="chip-row">
          {['🍓 유리 · 로맨스', '🔎 서윤 · 미스터리', '🛰️ NOVA-7 · SF', '👑 카이엘 · 판타지'].map((chip) => (
            <span className="chip" key={chip}>
              {chip}
            </span>
          ))}
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <div className="tab-switch" role="tablist" aria-label="인증 방식">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              className={mode === 'login' ? 'active' : ''}
              onClick={() => {
                setMode('login');
                setError(null);
              }}
            >
              로그인
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'signup'}
              className={mode === 'signup' ? 'active' : ''}
              onClick={() => {
                setMode('signup');
                setError(null);
              }}
            >
              회원가입
            </button>
          </div>

          <form className="auth-form" onSubmit={submit}>
            <label className="field">
              <span>이메일</span>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                placeholder="you@gchat.app"
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>

            {mode === 'signup' && (
              <label className="field">
                <span>닉네임</span>
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={16}
                  value={username}
                  placeholder="대화명 (2~16자)"
                  onChange={(event) => setUsername(event.target.value)}
                />
              </label>
            )}

            <label className="field">
              <span>비밀번호</span>
              <input
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
                minLength={8}
                value={password}
                placeholder="8자 이상"
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>

            {error && <p className="form-error" role="alert">{error}</p>}

            <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
              {busy ? '처리 중…' : mode === 'login' ? '로그인' : '회원가입하고 시작하기'}
            </button>
          </form>

          <div className="auth-divider">
            <span>또는</span>
          </div>

          <button
            type="button"
            className="btn btn-ghost btn-block"
            disabled={busy}
            onClick={() => void run(() => api.login('demo@gchat.app', 'demo1234'))}
          >
            체험 계정으로 둘러보기
          </button>
          <p className="auth-hint">
            체험 계정은 <code>demo@gchat.app</code> / <code>demo1234</code> 로도 로그인할 수 있습니다.
          </p>
        </div>
      </section>
    </div>
  );
}
