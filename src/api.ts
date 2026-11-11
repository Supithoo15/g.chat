import type { Character, CharacterInput, Conversation, Message, Meta, User } from './types';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string> | undefined) };
  if (init?.body) headers['Content-Type'] = 'application/json';

  const res = await fetch(path, { credentials: 'same-origin', ...init, headers });
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) {
    throw new ApiError(data?.error || '요청을 처리하지 못했습니다.', res.status);
  }
  return data as T;
}

export const api = {
  me: () => request<{ user: User | null }>('/api/auth/me'),
  login: (email: string, password: string) =>
    request<{ user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  signup: (email: string, username: string, password: string) =>
    request<{ user: User }>('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, username, password }),
    }),
  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  meta: () => request<Meta>('/api/meta'),

  characters: () => request<{ items: Character[] }>('/api/characters'),
  createCharacter: (input: CharacterInput) =>
    request<{ character: Character }>('/api/characters', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateCharacter: (id: string, input: Partial<CharacterInput>) =>
    request<{ character: Character }>(`/api/characters/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  deleteCharacter: (id: string) =>
    request<{ ok: boolean }>(`/api/characters/${id}`, { method: 'DELETE' }),

  conversations: () => request<{ items: Conversation[] }>('/api/conversations'),
  startConversation: (characterId: string) =>
    request<{ conversation: Conversation; messages: Message[] }>('/api/conversations', {
      method: 'POST',
      body: JSON.stringify({ characterId }),
    }),
  messages: (conversationId: string) =>
    request<{ conversation: Conversation; messages: Message[] }>(
      `/api/conversations/${conversationId}/messages`,
    ),
  sendMessage: (conversationId: string, content: string) =>
    request<{ messages: Message[]; source: string }>(
      `/api/conversations/${conversationId}/messages`,
      { method: 'POST', body: JSON.stringify({ content }) },
    ),
  deleteConversation: (id: string) =>
    request<{ ok: boolean }>(`/api/conversations/${id}`, { method: 'DELETE' }),
};
