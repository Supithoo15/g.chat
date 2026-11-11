import { useState } from 'react';
import type { Character, CharacterInput, Genre } from '../types';

type Props = {
  initial: Character | null;
  genres: Genre[];
  accents: string[];
  busy: boolean;
  error: string | null;
  onSubmit: (input: CharacterInput) => void;
  onClose: () => void;
};

const EMOJI_CHOICES = ['🍓', '🌤️', '🔎', '✨', '🛰️', '👑', '🍲', '🗡️', '🎤', '🐾', '🌙', '🎧', '🕯️', '🧸', '🦋', '🌊'];

export default function CharacterForm({ initial, genres, accents, busy, error, onSubmit, onClose }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [emoji, setEmoji] = useState(initial?.emoji ?? '✨');
  const [tagline, setTagline] = useState(initial?.tagline ?? '');
  const [genre, setGenre] = useState(initial?.genre ?? 'romance');
  const [accent, setAccent] = useState(initial?.accent ?? 'violet');
  const [greeting, setGreeting] = useState(initial?.greeting ?? '');
  const [systemPrompt, setSystemPrompt] = useState(initial?.systemPrompt ?? '');
  const [isPublic, setIsPublic] = useState(initial?.isPublic ?? false);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    onSubmit({
      name: name.trim(),
      emoji: emoji.trim() || '✨',
      tagline: tagline.trim(),
      genre,
      accent,
      greeting: greeting.trim(),
      systemPrompt: systemPrompt.trim(),
      isPublic,
    });
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="캐릭터 만들기">
      <div className={`modal accent-${accent}`}>
        <header className="modal-header">
          <h2>{initial ? '캐릭터 수정' : '나만의 테마 캐릭터 만들기'}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </header>

        <div className="modal-preview">
          <span className="char-avatar big">{emoji}</span>
          <div>
            <strong>{name || '이름 없는 캐릭터'}</strong>
            <p>{tagline || '한 줄 소개가 여기에 표시됩니다.'}</p>
          </div>
        </div>

        <form className="modal-form" onSubmit={submit}>
          <div className="field-row">
            <label className="field field-grow">
              <span>캐릭터 이름</span>
              <input
                value={name}
                required
                maxLength={16}
                placeholder="예: 유리"
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label className="field">
              <span>이모지</span>
              <input
                value={emoji}
                maxLength={4}
                className="emoji-input"
                onChange={(event) => setEmoji(event.target.value)}
              />
            </label>
          </div>

          <div className="emoji-row">
            {EMOJI_CHOICES.map((choice) => (
              <button
                key={choice}
                type="button"
                className={`emoji-chip ${emoji === choice ? 'active' : ''}`}
                onClick={() => setEmoji(choice)}
                aria-label={`이모지 ${choice}`}
              >
                {choice}
              </button>
            ))}
          </div>

          <label className="field">
            <span>한 줄 소개</span>
            <input
              value={tagline}
              required
              maxLength={60}
              placeholder="예: 툭툭 대면서도 결국엔 네 걱정부터 하는 소꿉친구"
              onChange={(event) => setTagline(event.target.value)}
            />
          </label>

          <label className="field">
            <span>장르</span>
            <select value={genre} onChange={(event) => setGenre(event.target.value)}>
              {genres.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <div className="field">
            <span>테마 색상</span>
            <div className="swatch-row">
              {accents.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`swatch accent-${item} ${accent === item ? 'active' : ''}`}
                  onClick={() => setAccent(item)}
                  aria-label={`테마 색상 ${item}`}
                />
              ))}
            </div>
          </div>

          <label className="field">
            <span>첫 인사</span>
            <textarea
              value={greeting}
              required
              rows={2}
              maxLength={300}
              placeholder="예: ...뭐야, 또 왔네. 딱히 기다린 건 아니야."
              onChange={(event) => setGreeting(event.target.value)}
            />
          </label>

          <label className="field">
            <span>캐릭터 설정 (말투·성격·배경)</span>
            <textarea
              value={systemPrompt}
              required
              rows={5}
              maxLength={1200}
              placeholder="예: 너는 유리, 사용자와 어릴 때부터 자란 소꿉친구다. 툭툭 대지만 속으로는 사용자를 아낀다. 반말을 쓴다."
              onChange={(event) => setSystemPrompt(event.target.value)}
            />
            <em className="field-hint">{systemPrompt.length} / 1200자</em>
          </label>

          <label className="checkbox">
            <input type="checkbox" checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} />
            <span>다른 사용자에게도 공개하기 (공개 캐릭터 탭에 노출)</span>
          </label>

          {error && <p className="form-error" role="alert">{error}</p>}

          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
              취소
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? '저장 중…' : initial ? '수정 저장' : '만들고 대화하기'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
