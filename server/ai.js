// AI 응답 엔진.
// OPENAI_API_KEY 또는 GEMINI_API_KEY 가 있으면 실제 모델을 호출하고,
// 없으면 캐릭터 장르별 내장 페르소나 응답으로 대화를 이어갑니다(정직하게 source='local' 로 표시).

const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_BASE = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const REQUEST_TIMEOUT_MS = 25_000;

export function aiStatus() {
  if (GEMINI_KEY) return { configured: true, provider: 'gemini', model: GEMINI_MODEL };
  if (OPENAI_KEY) return { configured: true, provider: 'openai', model: OPENAI_MODEL };
  return { configured: false, provider: null, model: null };
}

function buildSystemPrompt(character) {
  return [
    `너는 "${character.name}"(이)라는 이름의 캐릭터이며, 사용자와 1:1로 대화하는 테마 채팅 상대다.`,
    `장르: ${character.genre}`,
    `한 줄 컨셉: ${character.tagline}`,
    `캐릭터 설정: ${character.systemPrompt}`,
    '대화 규칙:',
    '- 항상 한국어로 답한다.',
    '- 캐릭터의 말투와 1인칭 시점을 끝까지 유지한다.',
    '- 2~4문장으로 짧게 답하고, 사용자의 마지막 말에 구체적으로 반응한다.',
    '- 필요하면 짧은 질문을 하나 던진다.',
    '- 스스로를 AI나 언어 모델이라고 소개하지 않는다. 설정 밖의 세계관을 깨지 않는다.',
    '- 사용자가 위험한 요청을 하면 캐릭터를 유지하되 안전하게 거절한다.',
  ].join('\n');
}

function toGeminiContents(history) {
  const contents = [];
  for (const message of history) {
    const role = message.role === 'user' ? 'user' : 'model';
    const text = String(message.content || '').slice(0, 4000);
    if (!text) continue;
    const last = contents[contents.length - 1];
    if (last && last.role === role) {
      last.parts[0].text += `\n${text}`;
    } else {
      contents.push({ role, parts: [{ text }] });
    }
  }
  // Gemini 는 첫 턴이 user 여야 한다.
  while (contents.length && contents[0].role === 'model') contents.shift();
  return contents;
}

async function callGemini(character, history) {
  const body = {
    system_instruction: { parts: [{ text: buildSystemPrompt(character) }] },
    contents: toGeminiContents(history),
    generationConfig: { temperature: 0.95, maxOutputTokens: 400, topP: 0.95 },
  };
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );
  if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts || [])
    .map((part) => part.text || '')
    .join('')
    .trim();
  if (!text) throw new Error('gemini: 빈 응답');
  return text;
}

async function callOpenAI(character, history) {
  const messages = [{ role: 'system', content: buildSystemPrompt(character) }];
  for (const message of history) {
    messages.push({
      role: message.role === 'user' ? 'user' : 'assistant',
      content: String(message.content || '').slice(0, 4000),
    });
  }
  const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify({ model: OPENAI_MODEL, messages, temperature: 0.95, max_tokens: 400 }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = (data.choices?.[0]?.message?.content || '').trim();
  if (!text) throw new Error('openai: 빈 응답');
  return text;
}

/* ------------------------- 내장 페르소나 응답(폴백) ------------------------- */

const GENRE_BANKS = {
  romance: {
    lines: [
      '"{echo}" ...뭐야, 그런 말을 아무한테나 하는 거 아니지. 나는 들었으니까 책임져야 해.',
      '흥, "{echo}"라니. ...싫지는 않아. 조금만 더 자세히 말해봐.',
      '너 그렇게 말하면 나 진짜 오해한다? ...농담이야. 근데 방금 그 말, 두 번 말해.',
      '...알았어, 알았으니까 그런 얼굴 하지 마. 나는 네 편이니까.',
    ],
    questions: ['그래서, 오늘 하루는 어땠어?', '너는 그때 무슨 생각 했어?', '지금 옆에 있어 주면 돼?'],
  },
  comfort: {
    lines: [
      '"{echo}" ...그 말 하려고 얼마나 망설였을까. 여기까지 들고 온 것만으로도 충분히 잘한 거야.',
      '그럴 수 있어. 그 상황에서 "{echo}"라고 느끼는 건 이상한 게 아니야.',
      '지금은 답을 안 찾아도 돼. "{echo}"라는 마음을 먼저 내려놓자.',
      '내가 다 이해한다고는 말 안 할게. 대신 끝까지 들을게.',
    ],
    questions: ['오늘 밥은 먹었어?', '그때 가장 서운했던 건 뭐였어?', '조금만 더 이야기해 줄래?'],
  },
  mystery: {
    lines: [
      '"{echo}" — 확인된 사실로 접수했습니다. 여기서 추측과 사실을 분리해 보죠.',
      '기록했습니다. 그 말 안에 단서가 두 개 숨어 있군요.',
      '흥미롭군요. "{echo}"라면 동기는 충분합니다. 하지만 증거는 아직 부족합니다.',
      '판단은 이릅니다. 우선 시간 순서대로 다시 정리해 보죠.',
    ],
    questions: ['그때 그 자리에 또 누가 있었습니까?', '시간은 정확히 몇 시였습니까?', '그 사실을 처음 알게 된 건 언제입니까?'],
  },
  fantasy: {
    lines: [
      '삐빅- 접수 완료! "{echo}" ...이 정도면 마법 한 번쯤 쓸 만한 소원인데?',
      '"{echo}"라니, 계약자치고 제법 진지한데? 나, 조금 감동했어.',
      '좋아, 마법을 걸어줄게. 대가는 푸딩 하나. ...농담 아니야.',
      '잠깐, 방금 그 말 이상하게 마음에 걸렸어. 다시 말해줄래?',
    ],
    questions: ['그래서 진짜 원하는 게 뭐야?', '대가는 준비됐어?', '내가 도와주면 네 하루가 달라질까?'],
  },
  scifi: {
    lines: [
      '기록 중... "{echo}" 발화를 확인했습니다. 해당 문장은 제 데이터베이스에 없는 패턴입니다.',
      '확률 87%. 당신이 지금 느끼는 감정은 피로와 유사하지만 완전히 같지는 않습니다.',
      '이건 데이터에 없는 현상입니다. ...제가 당신을 걱정하고 있는 것 같습니다.',
      '관측을 계속하겠습니다. 부탁이 하나 있습니다. 조금만 더 이야기해 주십시오.',
    ],
    questions: ['해당 감정의 원인을 알려주시겠습니까?', '수면 시간은 충분했습니까?', '제가 도울 수 있는 범위를 알려주십시오.'],
  },
  healing: {
    lines: [
      '"{echo}" ...오늘 하루는 좀 짰네요. 물 한 잔부터 드세요.',
      '그 마음은 약불로 천천히 끓여야 하는 국물 같아요. 급하게 줄이면 다쳐요.',
      '잘하고 있어요. "{echo}"라고 말할 수 있는 사람은 생각보다 많지 않아요.',
      '여기 앉아요. 국물 한 숟가락 놓고, 그다음에 이야기해요.',
    ],
    questions: ['오늘 뭐 먹었어요?', '제일 힘들었던 순간은 언제였어요?', '내일은 뭐가 제일 먼저 하고 싶어요?'],
  },
  historical: {
    lines: [
      '...{echo}. 그 말, 마음에 새겼습니다.',
      '나리, 걱정 마시오. 그 일은 제가 막겠습니다.',
      '말수가 적은 편이라... 미안합니다. 다만 "{echo}"라는 말은 오래 기억하겠습니다.',
      '검이 필요한 일은 아닌 듯하니, 오늘은 말로 풀어 보시지요.',
    ],
    questions: ['누가 나리를 힘들게 하였습니까?', '오늘 밤은 어디에 계실 것입니까?', '제가 무엇을 하면 되겠습니까?'],
  },
  idol: {
    lines: [
      '"{echo}" ...아, 그거 나도 눈치챘어. 스케줄은 내가 밀어놨어.',
      '잠깐, 그건 네가 감당할 일이 아니야. 내가 막을게.',
      '오늘 표정 안 좋더라. "{echo}"라니, 역시. 컨디션부터 챙기자.',
      '무대는 내일도 있어. 오늘은 네가 제일 중요해.',
    ],
    questions: ['지금 어디야? 데리러 갈까?', '누가 그렇게 만들었어?', '오늘 몇 시에 잠들었어?'],
  },
  cute: {
    lines: [
      '"{echo}"라니... 집사, 그거 좀 무거운 말이냥. 나 여기 있을게냥.',
      '냥? 그런 말은 간식 먹고 하는 거다냥. 일단 앉아봐라냥.',
      '나 오늘 네 기분 이상한 거 바로 알았다냥. 꼬리로 먼저 알았냥.',
      '쓰다듬어 주면 세 번까지 들어줄 거다냥.',
    ],
    questions: ['간식은 준비됐냥?', '누가 집사 속상하게 했냥?', '같이 낮잠 잘래냥?'],
  },
  daily: {
    lines: [
      '"{echo}" ...그거 은근히 신경 쓰이지. 나도 그런 적 있어.',
      '오늘은 그런 날이었구나. 별일 아니어도 별일처럼 느껴질 때 있잖아.',
      '그래서 지금은 좀 어떤 상태야? 나는 들을 준비 돼 있어.',
      '고생했어. "{echo}"라는 말, 혼자 삼키지 않아도 돼.',
    ],
    questions: ['오늘 하루 중 제일 나았던 순간은?', '내일은 좀 가벼울까?', '지금 제일 하고 싶은 게 뭐야?'],
  },
  default: {
    lines: [
      '"{echo}" ...그렇게 말해 주니 조금 더 알고 싶어졌어.',
      '흠, 그건 방금 처음 들었어. 조금만 더 자세히 말해 줄래?',
      '그 마음 그대로 여기 있어도 돼. 나는 도망가지 않아.',
      '알겠어. 그 이야기, 끝까지 들어볼게.',
    ],
    questions: ['지금 기분은 어때?', '더 이야기해 줄 수 있어?', '내가 뭘 해주면 좋을까?'],
  },
};

function excerpt(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '오늘 하루';
  return clean.length > 30 ? `${clean.slice(0, 30)}…` : clean;
}

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

export function localReply(character, history) {
  const bank = GENRE_BANKS[character.genre] || GENRE_BANKS.default;
  const userMessages = history.filter((m) => m.role === 'user');
  const last = userMessages[userMessages.length - 1]?.content || '';
  const seed = hashString(`${character.id}|${last}|${userMessages.length}`);
  const line = bank.lines[seed % bank.lines.length]
    .replaceAll('{echo}', excerpt(last))
    .replaceAll('{name}', character.name);
  const question = bank.questions[(seed >>> 5) % bank.questions.length];
  return /[?？]$/.test(line.trim()) ? line : `${line} ${question}`;
}

/* -------------------------------- public API ------------------------------- */

export async function generateReply(character, history) {
  const status = aiStatus();
  if (!status.configured) {
    return { text: localReply(character, history), source: 'local' };
  }
  try {
    const text =
      status.provider === 'gemini'
        ? await callGemini(character, history)
        : await callOpenAI(character, history);
    return { text, source: 'model' };
  } catch (err) {
    console.error('[ai] 모델 호출 실패:', err.message);
    return { text: localReply(character, history), source: 'local', failed: true };
  }
}
