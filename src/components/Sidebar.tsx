import type { Conversation, User } from '../types';

type Props = {
  user: User;
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (conversation: Conversation) => void;
  onNew: () => void;
  onDelete: (conversation: Conversation) => void;
  onLogout: () => void;
  open: boolean;
  onClose: () => void;
};

export default function Sidebar({
  user,
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onLogout,
  open,
  onClose,
}: Props) {
  return (
    <>
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-top">
          <div className="brand">
            <span className="brand-mark">G</span>
            <span className="brand-name">
              G<span className="brand-dot">.</span>CHAT
            </span>
          </div>
          <button type="button" className="icon-btn only-mobile" onClick={onClose} aria-label="사이드바 닫기">
            ✕
          </button>
        </div>

        <button type="button" className="btn btn-primary btn-block" onClick={onNew}>
          ＋ 새 테마챗 시작
        </button>

        <p className="sidebar-label">내 대화 {conversations.length > 0 && `· ${conversations.length}`}</p>

        <nav className="conv-list" aria-label="대화 목록">
          {conversations.length === 0 && (
            <p className="conv-empty">
              아직 대화가 없어요.
              <br />
              캐릭터를 골라 첫 대화를 시작해 보세요.
            </p>
          )}
          {conversations.map((conversation) => {
            const accent = conversation.character?.accent ?? 'violet';
            return (
              <div
                key={conversation.id}
                className={`conv-item accent-${accent} ${activeId === conversation.id ? 'active' : ''}`}
              >
                <button type="button" className="conv-main" onClick={() => onSelect(conversation)}>
                  <span className="conv-avatar">{conversation.character?.emoji ?? '💬'}</span>
                  <span className="conv-text">
                    <strong>{conversation.character?.name ?? '알 수 없는 캐릭터'}</strong>
                    <em>{conversation.preview || '대화를 시작해 보세요'}</em>
                  </span>
                </button>
                <button
                  type="button"
                  className="conv-delete"
                  aria-label={`${conversation.character?.name ?? '대화'} 삭제`}
                  onClick={() => onDelete(conversation)}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="user-chip">
            <span className="user-avatar">{user.username.slice(0, 1).toUpperCase()}</span>
            <span className="user-meta">
              <strong>{user.username}</strong>
              <em>{user.email}</em>
            </span>
          </div>
          <button type="button" className="btn btn-ghost btn-small" onClick={onLogout}>
            로그아웃
          </button>
        </div>
      </aside>
      {open && <button type="button" className="sidebar-backdrop" aria-label="사이드바 닫기" onClick={onClose} />}
    </>
  );
}
