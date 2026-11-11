import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from './api';
import type { Character, CharacterInput, Conversation, Message, Meta, User } from './types';
import AuthScreen from './components/AuthScreen';
import Sidebar from './components/Sidebar';
import ChatView from './components/ChatView';
import Gallery from './components/Gallery';
import CharacterForm from './components/CharacterForm';

const FALLBACK_META: Meta = {
  genres: [
    { id: 'romance', label: '로맨스' },
    { id: 'comfort', label: '위로' },
    { id: 'mystery', label: '미스터리' },
    { id: 'fantasy', label: '판타지' },
    { id: 'scifi', label: 'SF' },
    { id: 'healing', label: '힐링' },
    { id: 'historical', label: '사극' },
    { id: 'idol', label: '아이돌' },
    { id: 'cute', label: '큐트' },
    { id: 'daily', label: '일상' },
    { id: 'custom', label: '커스텀' },
  ],
  accents: ['rose', 'amber', 'slate', 'violet', 'cyan', 'indigo', 'emerald', 'gold', 'magenta', 'teal'],
  ai: { configured: false, provider: null, model: null },
};

type View = 'gallery' | 'chat';

export default function App() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);

  const [characters, setCharacters] = useState<Character[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);

  const [view, setView] = useState<View>('gallery');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeCharacter, setActiveCharacter] = useState<Character | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  const [sending, setSending] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Character | null>(null);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [charRes, convRes] = await Promise.all([api.characters(), api.conversations()]);
    setCharacters(charRes.items);
    setConversations(convRes.items);
  }, []);

  const describeError = useCallback((err: unknown) => {
    if (err instanceof ApiError && err.status === 401) {
      setUser(null);
      setCharacters([]);
      setConversations([]);
      setMessages([]);
      setActiveId(null);
      setActiveCharacter(null);
      setView('gallery');
      return '로그인이 만료되었습니다. 다시 로그인해 주세요.';
    }
    return err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.';
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [me, metaRes] = await Promise.all([api.me(), api.meta()]);
        if (cancelled) return;
        setMeta(metaRes);
        if (me.user) {
          setUser(me.user);
          await refresh();
        }
      } catch {
        /* 부팅 중 오류는 로그인 화면에서 다시 시도할 수 있습니다. */
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const handleAuthed = useCallback(
    async (authedUser: User) => {
      setUser(authedUser);
      setError(null);
      setView('gallery');
      try {
        await refresh();
      } catch (err) {
        setError(describeError(err));
      }
    },
    [refresh, describeError],
  );

  const openConversation = useCallback(
    async (conversation: Conversation) => {
      setSidebarOpen(false);
      setError(null);
      try {
        const res = await api.messages(conversation.id);
        setActiveId(conversation.id);
        setActiveCharacter(res.conversation.character ?? conversation.character);
        setMessages(res.messages);
        setView('chat');
      } catch (err) {
        setError(describeError(err));
      }
    },
    [describeError],
  );

  const startChat = useCallback(
    async (character: Character) => {
      setBusyId(character.id);
      setError(null);
      try {
        const res = await api.startConversation(character.id);
        setActiveId(res.conversation.id);
        setActiveCharacter(character);
        setMessages(res.messages);
        setConversations((prev) => [
          { ...res.conversation, character, preview: character.greeting },
          ...prev.filter((item) => item.id !== res.conversation.id),
        ]);
        setView('chat');
        setSidebarOpen(false);
      } catch (err) {
        setError(describeError(err));
      } finally {
        setBusyId(null);
      }
    },
    [describeError],
  );

  const sendMessage = useCallback(
    async (content: string) => {
      if (!activeId || sending) return false;
      const optimistic: Message = {
        id: `tmp-${Date.now()}`,
        role: 'user',
        content,
        createdAt: Date.now(),
        source: null,
      };
      setMessages((prev) => [...prev, optimistic]);
      setSending(true);
      setError(null);
      try {
        const res = await api.sendMessage(activeId, content);
        setMessages((prev) => [
          ...prev.filter((message) => message.id !== optimistic.id),
          ...res.messages,
        ]);
        const reply = res.messages.find((message) => message.role === 'assistant');
        setConversations((prev) =>
          prev
            .map((item) =>
              item.id === activeId
                ? { ...item, preview: reply?.content ?? item.preview, updatedAt: Date.now() }
                : item,
            )
            .sort((a, b) => b.updatedAt - a.updatedAt),
        );
        return true;
      } catch (err) {
        setMessages((prev) => prev.filter((message) => message.id !== optimistic.id));
        setError(describeError(err));
        return false;
      } finally {
        setSending(false);
      }
    },
    [activeId, sending, describeError],
  );

  const deleteConversation = useCallback(
    async (conversation: Conversation) => {
      if (!window.confirm(`'${conversation.character?.name ?? '대화'}' 대화 기록을 삭제할까요?`)) return;
      try {
        await api.deleteConversation(conversation.id);
        setConversations((prev) => prev.filter((item) => item.id !== conversation.id));
        if (activeId === conversation.id) {
          setActiveId(null);
          setActiveCharacter(null);
          setMessages([]);
          setView('gallery');
        }
      } catch (err) {
        setError(describeError(err));
      }
    },
    [activeId, describeError],
  );

  const submitCharacter = useCallback(
    async (input: CharacterInput) => {
      setFormBusy(true);
      setFormError(null);
      try {
        if (editing) {
          await api.updateCharacter(editing.id, input);
          await refresh();
          setFormOpen(false);
          setEditing(null);
          if (activeCharacter?.id === editing.id) {
            setActiveCharacter({ ...activeCharacter, ...input });
          }
        } else {
          const res = await api.createCharacter(input);
          await refresh();
          setFormOpen(false);
          setEditing(null);
          await startChat(res.character);
        }
      } catch (err) {
        setFormError(describeError(err));
      } finally {
        setFormBusy(false);
      }
    },
    [editing, refresh, startChat, activeCharacter, describeError],
  );

  const deleteCharacter = useCallback(
    async (character: Character) => {
      if (!window.confirm(`'${character.name}' 캐릭터를 삭제할까요? 관련 대화도 함께 삭제됩니다.`)) return;
      try {
        await api.deleteCharacter(character.id);
        await refresh();
        if (activeCharacter?.id === character.id) {
          setActiveId(null);
          setActiveCharacter(null);
          setMessages([]);
          setView('gallery');
        }
      } catch (err) {
        setError(describeError(err));
      }
    },
    [refresh, activeCharacter, describeError],
  );

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      /* 세션이 이미 만료된 경우도 있습니다. */
    }
    setUser(null);
    setConversations([]);
    setCharacters([]);
    setMessages([]);
    setActiveId(null);
    setActiveCharacter(null);
    setView('gallery');
  }, []);

  if (booting) {
    return (
      <div className="splash">
        <span className="brand-mark brand-mark-xl">G</span>
        <p>G.CHAT 불러오는 중…</p>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen onAuthed={(authed) => void handleAuthed(authed)} />;
  }

  const activeMeta = meta ?? FALLBACK_META;

  return (
    <div className="app">
      <div className="shell">
        <Sidebar
          user={user}
          conversations={conversations}
          activeId={activeId}
          onSelect={(conversation) => void openConversation(conversation)}
          onNew={() => {
            setView('gallery');
            setSidebarOpen(false);
          }}
          onDelete={(conversation) => void deleteConversation(conversation)}
          onLogout={() => void logout()}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        <main className="main">
          {view === 'chat' && activeCharacter ? (
            <ChatView
              character={activeCharacter}
              messages={messages}
              sending={sending}
              error={error}
              aiConfigured={activeMeta.ai.configured}
              onSend={sendMessage}
              onOpenSidebar={() => setSidebarOpen(true)}
              onBrowse={() => setView('gallery')}
            />
          ) : (
            <Gallery
              characters={characters}
              genres={activeMeta.genres}
              currentUserId={user.id}
              busyId={busyId}
              onStart={(character) => void startChat(character)}
              onCreate={() => {
                setEditing(null);
                setFormError(null);
                setFormOpen(true);
              }}
              onEdit={(character) => {
                setEditing(character);
                setFormError(null);
                setFormOpen(true);
              }}
              onDelete={(character) => void deleteCharacter(character)}
            />
          )}

          {view === 'gallery' && error && (
            <p className="form-error gallery-error" role="alert">
              {error}
            </p>
          )}
        </main>
      </div>

      {formOpen && (
        <CharacterForm
          initial={editing}
          genres={activeMeta.genres}
          accents={activeMeta.accents}
          busy={formBusy}
          error={formError}
          onSubmit={(input) => void submitCharacter(input)}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
            setFormError(null);
          }}
        />
      )}
    </div>
  );
}
