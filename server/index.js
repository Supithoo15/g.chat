import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as store from './store.js';
import { generateReply, aiStatus } from './ai.js';
import { ACCENTS, GENRES } from './presets.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const COOKIE_NAME = 'gc_session';

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '96kb' }));

/* --------------------------------- helpers -------------------------------- */

function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      out[key] = part.slice(index + 1).trim();
    }
  }
  return out;
}

function isSecure(req) {
  return req.secure || String(req.headers['x-forwarded-proto'] || '').includes('https');
}

function setSessionCookie(req, res, token) {
  const parts = [
    `${COOKIE_NAME}=${token}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${60 * 60 * 24 * 30}`,
  ];
  if (isSecure(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(req, res) {
  const parts = [`${COOKIE_NAME}=`, 'HttpOnly', 'Path=/', 'SameSite=Lax', 'Max-Age=0'];
  if (isSecure(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function sessionToken(req) {
  return parseCookies(req.headers.cookie)[COOKIE_NAME] || null;
}

function currentUser(req) {
  return store.userForSession(sessionToken(req));
}

function requireAuth(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: '로그인이 필요합니다.' });
  req.user = user;
  return next();
}

const buckets = new Map();
function rateLimit(name, max, windowMs) {
  return (req, res, next) => {
    const key = `${name}:${req.ip}`;
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || now > bucket.reset) {
      buckets.set(key, { count: 1, reset: now + windowMs });
      return next();
    }
    bucket.count += 1;
    if (bucket.count > max) {
      return res.status(429).json({ error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' });
    }
    return next();
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now > bucket.reset) buckets.delete(key);
  }
}, 60_000).unref();

function text(value, max) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, max);
}

const ACCENT_SET = new Set(ACCENTS);
const GENRE_SET = new Set(GENRES.map((g) => g.id));

function validateCharacterPayload(body, { partial = false } = {}) {
  const errors = [];
  const data = {};

  const pick = (key, max, label, min = 0) => {
    if (partial && body[key] === undefined) return;
    const value = text(body[key], max);
    if (value.length < Math.max(1, min)) {
      errors.push(`${label}을(를) 입력해 주세요.`);
      return;
    }
    data[key] = value;
  };

  pick('name', 16, '캐릭터 이름');
  pick('emoji', 4, '이모지');
  pick('tagline', 60, '한 줄 소개', 2);
  pick('greeting', 300, '첫 인사', 2);
  pick('systemPrompt', 1200, '캐릭터 설정', 10);

  if (!partial || body.genre !== undefined) {
    const genre = text(body.genre, 20) || 'custom';
    if (!GENRE_SET.has(genre)) errors.push('지원하지 않는 장르입니다.');
    else data.genre = genre;
  }

  if (!partial || body.accent !== undefined) {
    const accent = text(body.accent, 20) || 'violet';
    if (!ACCENT_SET.has(accent)) errors.push('지원하지 않는 테마 색상입니다.');
    else data.accent = accent;
  }

  if (body.isPublic !== undefined) data.isPublic = Boolean(body.isPublic);

  return { data, errors };
}

/* ---------------------------------- auth ---------------------------------- */

const authLimiter = rateLimit('auth', 30, 60_000);

app.post('/api/auth/signup', authLimiter, (req, res) => {
  const email = text(req.body?.email, 120).toLowerCase();
  const username = text(req.body?.username, 16);
  const password = String(req.body?.password ?? '');

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return res.status(400).json({ error: '올바른 이메일 주소를 입력해 주세요.' });
  }
  if (username.length < 2 || username.length > 16) {
    return res.status(400).json({ error: '닉네임은 2~16자로 입력해 주세요.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: '비밀번호는 8자 이상이어야 합니다.' });
  }
  if (password.length > 200) {
    return res.status(400).json({ error: '비밀번호가 너무 깁니다.' });
  }

  try {
    const user = store.createUser({ email, username, password });
    const token = store.createSession(user.id);
    setSessionCookie(req, res, token);
    return res.status(201).json({ user });
  } catch (err) {
    if (err.code === 'EMAIL_TAKEN' || err.code === 'USERNAME_TAKEN') {
      return res.status(409).json({ error: err.message });
    }
    console.error('[auth] signup 실패:', err);
    return res.status(500).json({ error: '회원가입에 실패했습니다.' });
  }
});

app.post('/api/auth/login', authLimiter, (req, res) => {
  const email = text(req.body?.email, 120).toLowerCase();
  const password = String(req.body?.password ?? '');
  const user = store.verifyLogin(email, password);
  if (!user) {
    return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
  }
  const token = store.createSession(user.id);
  setSessionCookie(req, res, token);
  return res.json({ user });
});

app.post('/api/auth/logout', (req, res) => {
  store.destroySession(sessionToken(req));
  clearSessionCookie(req, res);
  return res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  return res.json({ user: currentUser(req) });
});

app.get('/api/meta', (_req, res) => {
  return res.json({ genres: GENRES, accents: ACCENTS, ai: aiStatus() });
});

/* -------------------------------- characters ------------------------------- */

app.get('/api/characters', requireAuth, (req, res) => {
  return res.json({ items: store.listCharactersForUser(req.user.id) });
});

app.get('/api/characters/:id', requireAuth, (req, res) => {
  const character = store.getCharacter(req.params.id);
  if (!character || !store.canUseCharacter(character, req.user.id)) {
    return res.status(404).json({ error: '캐릭터를 찾을 수 없습니다.' });
  }
  return res.json({ character });
});

app.post('/api/characters', requireAuth, rateLimit('create-char', 20, 60_000), (req, res) => {
  if (store.countCharactersByOwner(req.user.id) >= 40) {
    return res.status(400).json({ error: '캐릭터는 최대 40개까지 만들 수 있습니다.' });
  }
  const { data, errors } = validateCharacterPayload(req.body || {});
  if (errors.length) return res.status(400).json({ error: errors[0], errors });

  const character = store.createCharacter(req.user.id, {
    name: data.name,
    emoji: data.emoji,
    tagline: data.tagline,
    greeting: data.greeting,
    systemPrompt: data.systemPrompt,
    genre: data.genre,
    accent: data.accent,
    isPublic: data.isPublic ?? false,
  });
  return res.status(201).json({ character });
});

app.patch('/api/characters/:id', requireAuth, (req, res) => {
  const existing = store.getCharacter(req.params.id);
  if (!existing) return res.status(404).json({ error: '캐릭터를 찾을 수 없습니다.' });
  if (existing.isPreset || existing.ownerId !== req.user.id) {
    return res.status(403).json({ error: '내가 만든 캐릭터만 수정할 수 있습니다.' });
  }
  const { data, errors } = validateCharacterPayload(req.body || {}, { partial: true });
  if (errors.length) return res.status(400).json({ error: errors[0], errors });
  const character = store.updateCharacter(req.params.id, req.user.id, data);
  return res.json({ character });
});

app.delete('/api/characters/:id', requireAuth, (req, res) => {
  const ok = store.deleteCharacter(req.params.id, req.user.id);
  if (!ok) return res.status(403).json({ error: '내가 만든 캐릭터만 삭제할 수 있습니다.' });
  return res.json({ ok: true });
});

/* ------------------------------- conversations ----------------------------- */

app.get('/api/conversations', requireAuth, (req, res) => {
  return res.json({ items: store.listConversations(req.user.id) });
});

app.post('/api/conversations', requireAuth, rateLimit('new-conv', 60, 60_000), (req, res) => {
  const character = store.getCharacter(text(req.body?.characterId, 60));
  if (!character || !store.canUseCharacter(character, req.user.id)) {
    return res.status(404).json({ error: '캐릭터를 찾을 수 없습니다.' });
  }
  const conversation = store.createConversation(
    req.user.id,
    character.id,
    `${character.name}와의 대화`,
  );
  if (character.greeting) {
    store.addMessage({
      conversationId: conversation.id,
      role: 'assistant',
      content: character.greeting,
      source: 'greeting',
    });
  }
  return res.status(201).json({
    conversation: { ...conversation, character, preview: character.greeting },
    messages: store.listMessages(conversation.id),
  });
});

app.get('/api/conversations/:id/messages', requireAuth, (req, res) => {
  const conversation = store.getConversation(req.params.id, req.user.id);
  if (!conversation) return res.status(404).json({ error: '대화를 찾을 수 없습니다.' });
  const character = store.getCharacter(conversation.characterId);
  return res.json({
    conversation: { ...conversation, character },
    messages: store.listMessages(conversation.id),
  });
});

app.post(
  '/api/conversations/:id/messages',
  requireAuth,
  rateLimit('send', 40, 60_000),
  async (req, res) => {
    const conversation = store.getConversation(req.params.id, req.user.id);
    if (!conversation) return res.status(404).json({ error: '대화를 찾을 수 없습니다.' });

    const character = store.getCharacter(conversation.characterId);
    if (!character) return res.status(404).json({ error: '캐릭터를 찾을 수 없습니다.' });

    const content = text(req.body?.content, 2000);
    if (!content) return res.status(400).json({ error: '메시지를 입력해 주세요.' });

    const userMessage = store.addMessage({
      conversationId: conversation.id,
      role: 'user',
      content,
    });

    const history = store.listMessages(conversation.id).slice(-24);
    const reply = await generateReply(character, history);

    const assistantMessage = store.addMessage({
      conversationId: conversation.id,
      role: 'assistant',
      content: reply.text,
      source: reply.source,
    });

    store.touchConversation(conversation.id);

    return res.json({
      messages: [userMessage, assistantMessage],
      source: reply.source,
      modelFailed: Boolean(reply.failed),
    });
  },
);

app.delete('/api/conversations/:id', requireAuth, (req, res) => {
  const ok = store.deleteConversation(req.params.id, req.user.id);
  if (!ok) return res.status(404).json({ error: '대화를 찾을 수 없습니다.' });
  return res.json({ ok: true });
});

/* --------------------------------- fallback -------------------------------- */

app.use('/api', (_req, res) => {
  res.status(404).json({ error: '존재하지 않는 API 경로입니다.' });
});

app.use((err, _req, res, _next) => {
  console.error('[api] 처리되지 않은 오류:', err);
  if (res.headersSent) return;
  res.status(500).json({ error: '서버 오류가 발생했습니다.' });
});

/* ------------------------------- static build ------------------------------ */

const distDir = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir, { index: false, maxAge: '1h' }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  const status = aiStatus();
  console.log(`G.CHAT 서버가 http://0.0.0.0:${PORT} 에서 실행 중입니다.`);
  console.log(
    status.configured
      ? `AI 엔진: ${status.provider} (${status.model})`
      : 'AI 엔진: 내장 페르소나 모드 (OPENAI_API_KEY 또는 GEMINI_API_KEY 를 설정하면 실제 모델 사용)',
  );
});
