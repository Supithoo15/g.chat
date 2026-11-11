import { useEffect, useRef, useState } from 'react';
import type { Character, Message } from '../types';

type Props = {
  character: Character;
  messages: Message[];
  sending: boolean;
  error: string | null;
  aiConfigured: boolean;
  onSend: (content: string) => Promise<boolean>;
  onOpenSidebar: () => void;
  onBrowse: () => void;
};

const SUGGESTIONS = ['오늘 하루 좀 힘들었어', '너는 어떤 캐릭터야?', '나랑 이야기해 줄래?'];

export default function ChatView({
  character,
  messages,
  sending,
  error,
  aiConfigured,
  onSend,
  onOpenSidebar,
  onBrowse,
}: Props) {
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages.length, sending]);

  useEffect(() => {
    setDraft('');
  }, [character.id]);

  async function submit() {
    const content = draft.trim();
    if (!content || sending) return;
    const ok = await onSend(content);
    if (ok) setDraft('');
  }

  return (
    <section className={`chat accent-${character.accent}`}>
      <header className="chat-header">
        <button type="button" className="icon-btn only-mobile" onClick={onOpenSidebar} aria-label="대화 목록 열기">
          ☰
        </button>
        <span className="chat-avatar">{character.emoji}</span>
        <div className="chat-identity">
          <h1>
            {character.name}
            <span className="genre-tag">{character.genre}</span>
          </h1>
          <p>{character.tagline}</p>
        </div>
        <button type="button" className="btn btn-ghost btn-small" onClick={onBrowse}>
          캐릭터 바꾸기
        </button>
      </header>

      {!aiConfigured && (
        <p className="mode-banner">
          내장 페르소나 모드로 대화 중입니다. 실제 AI 모델을 연결하려면 <code>OPENAI_API_KEY</code> 또는{' '}
          <code>GEMINI_API_KEY</code> 환경변수를 추가하세요.
        </p>
      )}

      <div className="messages" ref={scrollRef}>
        {messages.map((message) => (
          <div key={message.id} className={`msg-row ${message.role}`}>
            {message.role === 'assistant' && <span className="msg-avatar">{character.emoji}</span>}
            <div className="bubble">
              <p>{message.content}</p>
            </div>
          </div>
        ))}

        {sending && (
          <div className="msg-row assistant">
            <span className="msg-avatar">{character.emoji}</span>
            <div className="bubble typing" aria-label="입력 중">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}

        {error && <p className="form-error chat-error" role="alert">{error}</p>}
      </div>

      <div className="composer">
        <div className="suggestion-row">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="chip chip-btn"
              onClick={() => void onSend(suggestion)}
              disabled={sending}
            >
              {suggestion}
            </button>
          ))}
        </div>
        <div className="composer-box">
          <textarea
            ref={inputRef}
            value={draft}
            rows={1}
            maxLength={2000}
            placeholder={`${character.name}에게 메시지 보내기…`}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
          />
          <button
            type="button"
            className="btn btn-primary send-btn"
            onClick={() => void submit()}
            disabled={sending || draft.trim().length === 0}
          >
            보내기
          </button>
        </div>
        <p className="composer-hint">Enter 전송 · Shift+Enter 줄바꿈 · 최대 2000자</p>
      </div>
    </section>
  );
}
