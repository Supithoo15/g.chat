export type User = {
  id: string;
  email: string;
  username: string;
  createdAt: number;
};

export type Character = {
  id: string;
  name: string;
  emoji: string;
  genre: string;
  accent: string;
  tagline: string;
  systemPrompt: string;
  greeting: string;
  ownerId: string | null;
  ownerName: string | null;
  isPreset: boolean;
  isPublic: boolean;
  createdAt: number;
  updatedAt: number;
};

export type Conversation = {
  id: string;
  characterId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  character: Character | null;
  preview: string;
};

export type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  source: string | null;
};

export type AiStatus = {
  configured: boolean;
  provider: string | null;
  model: string | null;
};

export type Genre = { id: string; label: string };

export type Meta = {
  genres: Genre[];
  accents: string[];
  ai: AiStatus;
};

export type CharacterInput = {
  name: string;
  emoji: string;
  tagline: string;
  greeting: string;
  systemPrompt: string;
  genre: string;
  accent: string;
  isPublic: boolean;
};
