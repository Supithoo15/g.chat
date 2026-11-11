// G.CHAT API 회귀 스모크 테스트.
// 서버를 임시 데이터 디렉터리로 띄운 뒤 회원가입 → 캐릭터 생성 → 대화 → 메시지 → 재로그인 흐름을 검증합니다.
// 실행: node tests/smoke.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = Number(process.env.SMOKE_PORT || 3199);
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'gchat-smoke-'));
const failures = [];
const results = [];

function check(name, condition, detail = '') {
  if (condition) {
    results.push(`PASS ${name}`);
  } else {
    failures.push(`FAIL ${name}${detail ? ` :: ${detail}` : ''}`);
  }
}

function jarFrom(response) {
  const raw = response.headers.getSetCookie?.() ?? [];
  const cookies = raw.length ? raw : [response.headers.get('set-cookie')].filter(Boolean);
  return cookies.map((cookie) => String(cookie).split(';')[0]).join('; ');
}

async function call(method, url, { cookie = '', body } = {}) {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* HTML 응답 */
  }
  return { status: res.status, json, text, cookie: jarFrom(res) };
}

async function waitForServer(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/meta`);
      if (res.ok) return true;
    } catch {
      /* 아직 준비되지 않음 */
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return false;
}

const server = spawn(process.execPath, ['server/index.js'], {
  env: { ...process.env, PORT: String(PORT), DATA_DIR, OPENAI_API_KEY: '', GEMINI_API_KEY: '', GOOGLE_API_KEY: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (chunk) => {
  serverLog += chunk.toString();
});
server.stderr.on('data', (chunk) => {
  serverLog += chunk.toString();
});

let exitCode = 0;
try {
  const ready = await waitForServer();
  check('서버 기동', ready, serverLog.slice(-400));
  if (!ready) throw new Error('서버가 준비되지 않았습니다.');

  const meta = await call('GET', '/api/meta');
  check('메타 응답(장르/테마/AI 상태)', meta.status === 200 && meta.json.genres.length >= 10 && meta.json.accents.length >= 6);
  check('AI 키 없음 → 내장 모드 보고', meta.json.ai.configured === false);

  const anon = await call('GET', '/api/auth/me');
  check('비로그인 /auth/me → user null', anon.status === 200 && anon.json.user === null);

  const guarded = await call('GET', '/api/characters');
  check('비로그인 캐릭터 조회 차단(401)', guarded.status === 401);

  const signup = await call('POST', '/api/auth/signup', {
    body: { email: 'tester@example.com', username: '테스터', password: 'password123' },
  });
  check('회원가입 성공', signup.status === 201 && signup.json.user?.email === 'tester@example.com', signup.text.slice(0, 200));
  check('세션 쿠키 발급', Boolean(signup.cookie), signup.text.slice(0, 200));
  const userCookie = signup.cookie;

  const weak = await call('POST', '/api/auth/signup', { body: { email: 'x@y.co', username: 'a', password: '123' } });
  check('짧은 비밀번호/닉네임 거부(400)', weak.status === 400);

  const dup = await call('POST', '/api/auth/signup', {
    body: { email: 'tester@example.com', username: '다른이름', password: 'password123' },
  });
  check('중복 이메일 거부(409)', dup.status === 409);

  const list = await call('GET', '/api/characters', { cookie: userCookie });
  const presets = (list.json?.items ?? []).filter((item) => item.isPreset);
  check('프리셋 테마 캐릭터 제공(10종)', list.status === 200 && presets.length >= 10, `presets=${presets.length}`);
  check('프리셋은 장르/인사말 포함', presets.every((item) => item.genre && item.greeting && item.systemPrompt));

  const created = await call('POST', '/api/characters', {
    cookie: userCookie,
    body: {
      name: '달빛 서점 주인',
      emoji: '🌙',
      tagline: '새벽에만 문을 여는 서점 주인',
      greeting: '어서 와요. 오늘은 어떤 이야기를 찾으러 왔나요?',
      systemPrompt: '당신은 새벽에만 문을 여는 작은 서점의 주인입니다. 차분한 말투로 손님의 고민을 듣고 책을 추천합니다.',
      genre: 'healing',
      accent: 'indigo',
      isPublic: true,
    },
  });
  check('커스텀 캐릭터 생성', created.status === 201 && created.json.character?.name === '달빛 서점 주인', created.text.slice(0, 300));
  const custom = created.json?.character;

  const invalid = await call('POST', '/api/characters', {
    cookie: userCookie,
    body: { name: '짧음', emoji: '🙂', tagline: 'x', greeting: 'x', systemPrompt: '짧음', genre: 'healing', accent: 'indigo' },
  });
  check('부적절한 캐릭터 입력 거부(400)', invalid.status === 400);

  const started = await call('POST', '/api/conversations', { cookie: userCookie, body: { characterId: custom.id } });
  check(
    '커스텀 캐릭터로 대화 시작 + 첫 인사 저장',
    started.status === 201 && started.json.messages?.length === 1 && started.json.messages[0].role === 'assistant',
    started.text.slice(0, 300),
  );
  const conversationId = started.json?.conversation?.id;

  const reply = await call('POST', `/api/conversations/${conversationId}/messages`, {
    cookie: userCookie,
    body: { content: '요즘 잠이 잘 안 와서 고민이에요' },
  });
  const replyText = reply.json?.messages?.[1]?.content ?? '';
  check('메시지 전송 + AI 응답 수신', reply.status === 200 && replyText.length > 10, reply.text.slice(0, 300));
  check('응답 출처 표기(source)', typeof reply.json?.source === 'string' && reply.json.source.length > 0);

  const presetId = presets[0].id;
  const presetStart = await call('POST', '/api/conversations', { cookie: userCookie, body: { characterId: presetId } });
  const presetConv = presetStart.json?.conversation?.id;
  const presetReply = await call('POST', `/api/conversations/${presetConv}/messages`, {
    cookie: userCookie,
    body: { content: '안녕! 너는 누구야?' },
  });
  check('프리셋 캐릭터와 대화 가능', presetStart.status === 201 && (presetReply.json?.messages?.[1]?.content ?? '').length > 10);

  const convList = await call('GET', '/api/conversations', { cookie: userCookie });
  check('대화 목록 2건', convList.status === 200 && convList.json.items.length === 2, `count=${convList.json?.items?.length}`);
  check('대화 목록에 캐릭터 정보 포함', convList.json.items.every((item) => item.character?.name));

  const logout = await call('POST', '/api/auth/logout', { cookie: userCookie });
  check('로그아웃', logout.status === 200);
  const afterLogout = await call('GET', '/api/characters', { cookie: userCookie });
  check('로그아웃 후 세션 무효(401)', afterLogout.status === 401);

  const login = await call('POST', '/api/auth/login', {
    body: { email: 'tester@example.com', password: 'password123' },
  });
  check('재로그인 성공', login.status === 200 && login.json.user?.username === '테스터', login.text.slice(0, 200));
  const restored = await call('GET', '/api/conversations', { cookie: login.cookie });
  check('재로그인 후 대화 기록 유지', restored.status === 200 && restored.json.items.length === 2);

  const wrongPw = await call('POST', '/api/auth/login', { body: { email: 'tester@example.com', password: 'nope-nope' } });
  check('잘못된 비밀번호 거부(401)', wrongPw.status === 401);

  const page = await fetch(`${BASE}/`);
  const html = await page.text();
  check('빌드된 클라이언트 서빙', page.status === 200 && html.includes('G.CHAT'), html.slice(0, 120));

  const other = await call('GET', '/api/conversations', { cookie: '' });
  check('비로그인 대화 조회 차단(401)', other.status === 401);
} catch (err) {
  failures.push(`FAIL 예외: ${err instanceof Error ? err.message : String(err)}`);
} finally {
  server.kill('SIGTERM');
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
}

for (const line of results) console.log(line);
for (const line of failures) console.log(line);
console.log(`\n${results.length} passed, ${failures.length} failed`);
if (failures.length) {
  console.log('\n--- 서버 로그 ---');
  console.log(serverLog.slice(-1500));
  exitCode = 1;
}
process.exit(exitCode);
