import { useMemo, useState } from 'react';
import type { Character, Genre } from '../types';

type Tab = 'preset' | 'mine' | 'community';

type Props = {
  characters: Character[];
  genres: Genre[];
  currentUserId: string;
  busyId: string | null;
  onStart: (character: Character) => void;
  onCreate: () => void;
  onEdit: (character: Character) => void;
  onDelete: (character: Character) => void;
};

export default function Gallery({
  characters,
  genres,
  currentUserId,
  busyId,
  onStart,
  onCreate,
  onEdit,
  onDelete,
}: Props) {
  const [tab, setTab] = useState<Tab>('preset');
  const [query, setQuery] = useState('');

  const genreLabel = useMemo(() => {
    const map = new Map(genres.map((genre) => [genre.id, genre.label]));
    return (id: string) => map.get(id) ?? id;
  }, [genres]);

  const lists = useMemo(
    () => ({
      preset: characters.filter((character) => character.isPreset),
      mine: characters.filter((character) => character.ownerId === currentUserId),
      community: characters.filter(
        (character) => !character.isPreset && character.isPublic && character.ownerId !== currentUserId,
      ),
    }),
    [characters, currentUserId],
  );

  const visible = lists[tab].filter((character) => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return true;
    return (
      character.name.toLowerCase().includes(keyword) ||
      character.tagline.toLowerCase().includes(keyword) ||
      genreLabel(character.genre).toLowerCase().includes(keyword)
    );
  });

  return (
    <section className="gallery">
      <header className="gallery-header">
        <div>
          <h1>테마 캐릭터</h1>
          <p>이미 만들어진 캐릭터를 골라도 되고, 직접 만들어도 됩니다.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={onCreate}>
          ＋ 캐릭터 만들기
        </button>
      </header>

      <div className="gallery-tools">
        <div className="tab-switch tab-switch-lg" role="tablist" aria-label="캐릭터 목록">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'preset'}
            className={tab === 'preset' ? 'active' : ''}
            onClick={() => setTab('preset')}
          >
            기본 제공 ({lists.preset.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'mine'}
            className={tab === 'mine' ? 'active' : ''}
            onClick={() => setTab('mine')}
          >
            내가 만든 ({lists.mine.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'community'}
            className={tab === 'community' ? 'active' : ''}
            onClick={() => setTab('community')}
          >
            공개 캐릭터 ({lists.community.length})
          </button>
        </div>
        <input
          type="search"
          className="search-input"
          placeholder="이름·장르로 검색"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {visible.length === 0 ? (
        <div className="gallery-empty">
          {tab === 'mine' ? (
            <>
              <p>아직 만든 캐릭터가 없어요.</p>
              <button type="button" className="btn btn-primary" onClick={onCreate}>
                첫 캐릭터 만들기
              </button>
            </>
          ) : tab === 'community' ? (
            <p>공개된 캐릭터가 아직 없어요. 내 캐릭터를 공개로 만들면 여기에 노출됩니다.</p>
          ) : (
            <p>검색 결과가 없습니다.</p>
          )}
        </div>
      ) : (
        <div className="card-grid">
          {visible.map((character) => {
            const mine = character.ownerId === currentUserId;
            return (
              <article key={character.id} className={`char-card accent-${character.accent}`}>
                <div className="char-card-top">
                  <span className="char-avatar">{character.emoji}</span>
                  <span className="char-badges">
                    <span className="genre-tag">{genreLabel(character.genre)}</span>
                    {character.isPreset && <span className="tag tag-official">공식</span>}
                    {mine && <span className="tag tag-mine">내 캐릭터</span>}
                    {!character.isPreset && character.isPublic && !mine && (
                      <span className="tag tag-public">공개</span>
                    )}
                  </span>
                </div>
                <h2>{character.name}</h2>
                <p className="char-tagline">{character.tagline}</p>
                {character.ownerName && !character.isPreset && (
                  <p className="char-owner">by {character.ownerName}</p>
                )}
                <div className="char-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-small"
                    onClick={() => onStart(character)}
                    disabled={busyId === character.id}
                  >
                    {busyId === character.id ? '여는 중…' : '대화하기'}
                  </button>
                  {mine && (
                    <>
                      <button type="button" className="btn btn-ghost btn-small" onClick={() => onEdit(character)}>
                        수정
                      </button>
                      <button type="button" className="btn btn-ghost btn-small danger" onClick={() => onDelete(character)}>
                        삭제
                      </button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
