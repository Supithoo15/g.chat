import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PRESET_CHARACTERS } from './presets.js';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

const emptyDb = () => ({
  users: [],
  characters: [],
  conversations: [],
  messages: [],
  sessions: [],
});

let db = emptyDb();
let saveTimer = null;
let ready = false;

function persistNow() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${DB_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, DB_FILE);
  } catch (err) {
    console.error('[store] 저장 실패:', err.message);
  }
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    persistNow();
  }, 120);
}

function load() {
  if (ready) return;
  ready = true;
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    db = { ...emptyDb(), ...parsed };
  } catch {
    db = emptyDb();
  }
  seed();
  persistNow();
}

/* ---------------------------------- utils --------------------------------- */

export const newId = (prefix) => `${prefix}_${crypto.randomBytes(9).toString('hex')}`;

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  try {
    const candidate = crypto.scryptSync(password, salt, 64);
    const known = Buffer.from(hash, 'hex');
    if (known.length !== candidate.length) return false;
    return crypto.timingSafeEqual(candidate, known);
  } catch {
    return false;
  }
}

export function publicUser(user) {
  if (!user) return null;
  return { id: user.id, email: user.email, username: user.username, createdAt: user.createdAt };
}

/* ---------------------------------- seed ---------------------------------- */

function seed() {
  const now = Date.now();

  if (!db.characters.some((c) => c.isPreset)) {
    PRESET_CHARACTERS.forEach((preset, index) => {
      db.characters.push({
        id: preset.id,
        name: preset.name,
        emoji: preset.emoji,
        genre: preset.genre,
        accent: preset.accent,
        tagline: preset.tagline,
        systemPrompt: preset.systemPrompt,
        greeting: preset.greeting,
        ownerId: null,
        isPreset: true,
        isPublic: true,
        sortOrder: index,
        createdAt: now,
        updatedAt: now,
      });
    });
  }

  if (!db.users.some((u) => u.email === 'demo@gchat.app')) {
    const { salt, hash } = hashPassword('demo1234');
    db.users.push({
      id: newId('user'),
      email: 'demo@gchat.app',
      username: '체험계정',
      salt,
      hash,
      createdAt: now,
    });
  }

  // 만료된 세션 정리
  db.sessions = db.sessions.filter((s) => s.expiresAt > now);
}

load();

/* ---------------------------------- users --------------------------------- */

export function createUser({ email, username, password }) {
  if (db.users.some((u) => u.email === email)) {
    const err = new Error('이미 가입된 이메일입니다.');
    err.code = 'EMAIL_TAKEN';
    throw err;
  }
  if (db.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
    const err = new Error('이미 사용 중인 닉네임입니다.');
    err.code = 'USERNAME_TAKEN';
    throw err;
  }
  const { salt, hash } = hashPassword(password);
  const user = {
    id: newId('user'),
    email,
    username,
    salt,
    hash,
    createdAt: Date.now(),
  };
  db.users.push(user);
  scheduleSave();
  return publicUser(user);
}

export function verifyLogin(email, password) {
  const user = db.users.find((u) => u.email === email);
  if (!user) return null;
  if (!verifyPassword(password, user.salt, user.hash)) return null;
  return publicUser(user);
}

export function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions.push({ token, userId, createdAt: Date.now(), expiresAt: Date.now() + SESSION_TTL_MS });
  db.sessions = db.sessions.filter((s) => s.expiresAt > Date.now());
  scheduleSave();
  return token;
}

export function userForSession(token) {
  if (!token) return null;
  const session = db.sessions.find((s) => s.token === token);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    db.sessions = db.sessions.filter((s) => s.token !== token);
    scheduleSave();
    return null;
  }
  const user = db.users.find((u) => u.id === session.userId);
  return publicUser(user);
}

export function destroySession(token) {
  if (!token) return;
  db.sessions = db.sessions.filter((s) => s.token !== token);
  scheduleSave();
}

/* -------------------------------- characters ------------------------------- */

function decorate(character) {
  const owner = character.ownerId ? db.users.find((u) => u.id === character.ownerId) : null;
  return {
    id: character.id,
    name: character.name,
    emoji: character.emoji,
    genre: character.genre,
    accent: character.accent,
    tagline: character.tagline,
    systemPrompt: character.systemPrompt,
    greeting: character.greeting,
    ownerId: character.ownerId,
    ownerName: owner ? owner.username : null,
    isPreset: Boolean(character.isPreset),
    isPublic: Boolean(character.isPublic),
    createdAt: character.createdAt,
    updatedAt: character.updatedAt,
  };
}

export function listCharactersForUser(userId) {
  const visible = db.characters.filter(
    (c) => c.isPreset || c.ownerId === userId || (c.isPublic && c.ownerId !== userId),
  );
  const rank = (c) => {
    if (c.isPreset) return 0;
    if (c.ownerId === userId) return 1;
    return 2;
  };
  return visible
    .slice()
    .sort((a, b) => {
      const r = rank(a) - rank(b);
      if (r !== 0) return r;
      if (rank(a) === 0) return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      return b.createdAt - a.createdAt;
    })
    .map(decorate);
}

export function getCharacter(id) {
  const character = db.characters.find((c) => c.id === id);
  return character ? decorate(character) : null;
}

export function countCharactersByOwner(userId) {
  return db.characters.filter((c) => c.ownerId === userId).length;
}

export function createCharacter(ownerId, data) {
  const now = Date.now();
  const character = {
    id: newId('char'),
    ownerId,
    isPreset: false,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
    ...data,
  };
  db.characters.push(character);
  scheduleSave();
  return decorate(character);
}

export function updateCharacter(id, ownerId, data) {
  const character = db.characters.find((c) => c.id === id);
  if (!character) return null;
  if (character.isPreset || character.ownerId !== ownerId) return null;
  Object.assign(character, data, { updatedAt: Date.now() });
  scheduleSave();
  return decorate(character);
}

export function deleteCharacter(id, ownerId) {
  const character = db.characters.find((c) => c.id === id);
  if (!character || character.isPreset || character.ownerId !== ownerId) return false;
  const convoIds = db.conversations.filter((c) => c.characterId === id).map((c) => c.id);
  db.characters = db.characters.filter((c) => c.id !== id);
  db.conversations = db.conversations.filter((c) => c.characterId !== id);
  db.messages = db.messages.filter((m) => !convoIds.includes(m.conversationId));
  scheduleSave();
  return true;
}

export function canUseCharacter(character, userId) {
  if (!character) return false;
  return Boolean(character.isPreset) || character.ownerId === userId || Boolean(character.isPublic);
}

/* ------------------------------- conversations ----------------------------- */

export function listConversations(userId) {
  return db.conversations
    .filter((c) => c.userId === userId)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((c) => {
      const character = getCharacter(c.characterId);
      const last = db.messages
        .filter((m) => m.conversationId === c.id)
        .sort((a, b) => b.createdAt - a.createdAt)[0];
      return {
        id: c.id,
        characterId: c.characterId,
        title: c.title,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        character,
        preview: last ? last.content.slice(0, 80) : '',
      };
    });
}

export function getConversation(id, userId) {
  const convo = db.conversations.find((c) => c.id === id);
  if (!convo || convo.userId !== userId) return null;
  return convo;
}

export function createConversation(userId, characterId, title) {
  const now = Date.now();
  const convo = { id: newId('conv'), userId, characterId, title, createdAt: now, updatedAt: now };
  db.conversations.push(convo);
  scheduleSave();
  return convo;
}

export function touchConversation(id, patch = {}) {
  const convo = db.conversations.find((c) => c.id === id);
  if (!convo) return;
  Object.assign(convo, patch, { updatedAt: Date.now() });
  scheduleSave();
}

export function deleteConversation(id, userId) {
  const convo = db.conversations.find((c) => c.id === id);
  if (!convo || convo.userId !== userId) return false;
  db.conversations = db.conversations.filter((c) => c.id !== id);
  db.messages = db.messages.filter((m) => m.conversationId !== id);
  scheduleSave();
  return true;
}

/* --------------------------------- messages -------------------------------- */

export function listMessages(conversationId) {
  return db.messages
    .filter((m) => m.conversationId === conversationId)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
      source: m.source || null,
    }));
}

export function addMessage({ conversationId, role, content, source = null }) {
  const message = {
    id: newId('msg'),
    conversationId,
    role,
    content,
    source,
    createdAt: Date.now(),
  };
  db.messages.push(message);
  scheduleSave();
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
    source: message.source,
  };
}

process.on('exit', persistNow);
process.on('SIGTERM', () => {
  persistNow();
  process.exit(0);
});
process.on('SIGINT', () => {
  persistNow();
  process.exit(0);
});
