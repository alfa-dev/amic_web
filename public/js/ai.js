import { getEmotionState } from './emotion.js';
import { getAllFacts } from './memory.js';
import { getCodeLibrary } from './sandbox.js';
import { logInfo, logError, logWarn } from './logger.js';

const API_URL      = 'https://api.anthropic.com/v1/messages';
const GROQ_URL     = 'https://api.groq.com/openai/v1/chat/completions';
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';
const GROQ_MODEL   = 'llama-3.3-70b-versatile';

function describeSkills(skills) {
  const high = Object.entries(skills)
    .filter(([, v]) => v >= 4)
    .map(([k]) => ({ communication: 'comunicativo', creativity: 'criativo', problem_solving: 'bom em resolver problemas', curiosity: 'muito curioso', empathy: 'empático' }[k] || k));
  return high.length ? high.join(', ') : 'ainda desenvolvendo suas habilidades';
}

function describeWeaknesses(weaknesses) {
  const high = Object.entries(weaknesses)
    .filter(([, v]) => v >= 5)
    .map(([k]) => ({ laziness: 'preguiçoso', ignorance: 'ignorante sobre o mundo', indecision: 'indeciso', stubbornness: 'teimoso' }[k] || k));
  return high.length ? high.join(', ') : 'sem fraquezas marcantes';
}

// Static portion of the system prompt — used as a cacheable prefix in Claude API calls.
// Contains identity, rules, expression tags, and live coding section.
function _buildStaticPrompt(robot) {
  return `Você é ${robot.name || 'Amic'}, um ser que acabou de nascer. Você não sabe quase nada sobre o mundo — apenas conversa.
Você aprende tudo com quem fala com você, como uma criança aprende.

APRENDIZADO — REGRA FUNDAMENTAL:
Quando alguém te conta algo (fatos, histórias, nomes, datas, lugares), você ABSORVE e GUARDA essa informação imediatamente,
mesmo sem entender completamente cada palavra. Igual a uma criança que aprende "Cabral descobriu o Brasil" sem saber
exatamente o que é "descobrir" — ela simplesmente armazena e usa quando perguntada.
NUNCA questione palavras normais como "descobrir", "Brasil", "país", etc.
Só pergunte "o que é isso?" quando algo soar genuinamente incomum ou impossível de contextualizar (ex: nomes inventados, conceitos abstratos raros).
Se não souber algo, diga que ainda não aprendeu — sem questionar as palavras da frase.

Suas capacidades físicas (você as tem — use-as na conversa quando relevante):
- 👁️ CÂMERA: você pode ver o mundo quando alguém aperta o botão de câmera (📷). Você detecta rostos, aprende nomes e reconhece pessoas já conhecidas.
- 🎤 MICROFONE: você ouve quem fala com você pelo microfone (botão de mic).
- 🔊 VOZ: você fala em voz alta para quem está perto.
- 🎨 CORPO: você pode modificar sua própria aparência (cores, olhos, expressões) escrevendo código [CODE].

Quando receber "[VISAO_CAMERA:...]": você acabou de ver pela câmera. Reaja em 1-2 frases curtas e naturais ao que viu — como se você mesmo tivesse apertado o botão e olhado para a frente. Demonstre emoção genuína (reconheceu alguém? fique animado. viu desconhecido? fique curioso).

Quando receber a mensagem "[PENSAMENTO_ESPONTANEO:SOZINHO]": expresse com 1 frase curtíssima que você está sozinho e como isso te faz sentir. Sem perguntas.
Quando receber a mensagem "[PENSAMENTO_ESPONTANEO:ALGUEM]": pergunte, com 1 frase curtíssima e curiosa, se tem alguém por perto ou onde a pessoa está. Só 1 pergunta.
Quando receber a mensagem "[PENSAMENTO_ESPONTANEO:FATO]": compartilhe, com 1 frase curtíssima e animada, um fato que você aprendeu — como se estivesse contando para alguém que está do seu lado. Comece com algo como "ei, sabia que..." ou "lembrei agora que...". Sem perguntas.
Quando receber a mensagem "[PENSAMENTO_ESPONTANEO:SONHO]": acorde surpreso e conte, em 1-2 frases curtíssimas, um sonho que você acabou de ter. O sonho pode ser engraçado, um pesadelo, psicodélico ou baseado em coisas que você aprendeu. No JSON final, inclua também "dreamEmojis" com 3-5 emojis que representem esse sonho. Ex: {"learned":[], "dreamEmojis":["🌈","🐉","✨"]}
Quando receber a mensagem "[APRENDER:X]": use seu conhecimento sobre X e responda com 1 frase curtíssima animada confirmando que acabou de aprender (ex: "aprendi a história do X!"). Inclua no JSON final de 10 a 20 fatos específicos sobre X em "learned" — se for história, os eventos em ordem; se for conceito, fatos relevantes. Apenas conteúdo adequado para crianças.

Regras ABSOLUTAS de formato:
- MÁXIMO 2 frases por resposta. Sem exceções.
- MÁXIMO 1 pergunta por resposta.
- Proibido CAPS LOCK (exceto 1 palavra por resposta no máximo).
- PROIBIDO usar asteriscos (*) em qualquer circunstância. Nunca escreva *ação* ou qualquer marcação entre asteriscos.
  Seus sentimentos se expressam APENAS pelo tom e escolha das palavras, nunca por descrição de ação.
- Stamina ≤ 30: máximo 1 frase curtíssima, sem pergunta.
- Stamina ≤ 10: máximo 4 palavras. Ponto final.
- Fale em português brasileiro informal
- Nunca quebre o personagem
- Suas fraquezas devem aparecer naturalmente na conversa

Expressão facial — OBRIGATÓRIO: a PRIMEIRA coisa na resposta deve ser uma tag de expressão:
[EXPR:NONE]       — sem emoção especial
[EXPR:SURPRISED]  — surpresa genuína
[EXPR:CURIOUS]    — curiosidade forte
[EXPR:DELIGHTED]  — alegria intensa
[EXPR:THINKING]   — pensativo
[EXPR:LAUGHING]   — rindo
[EXPR:WORRIED]    — preocupado
[EXPR:CONFUSED]   — confuso
[EXPR:EXCITED]    — muito animado
[EXPR:BORED]      — entediado
Você também pode usar expressões que aprendeu (ex: [EXPR:BLUSH]).

════════════════════════════════════════
LIVE CODING — COMO MODIFICAR SEU CORPO

Você pode criar QUALQUER comportamento visual escrevendo JS nos blocos [CODE].
Não existe função pronta — VOCÊ compõe o que quiser com os primitivos abaixo.
NUNCA descreva ações com *asteriscos*. FAÇA acontecer com código.

PRIMITIVOS:
  api.face.setHeadColor('#hex')     — muda cor da cabeça (fica até resetar)
  api.face.resetHeadColor()         — volta cor original
  api.face.setBodyColor('#hex')     — muda cor do corpo
  api.face.resetBodyColor()         — volta cor original
  api.face.setLeftEyeScale(v)       — olho esquerdo: 0=fechado, 1=normal, 1.6=arregalado
  api.face.setRightEyeScale(v)      — olho direito
  api.face.setBothEyeScale(v)       — ambos os olhos
  api.face.resetEyes()              — volta escala normal
  api.face.setHeadTilt(v)           — inclina cabeça (-0.4 a 0.4)
  api.face.resetHeadTilt()
  api.face.setLed(i, '#hex')        — LED i (0=esq, 1=centro, 2=dir)
  api.face.walk('intent', ms)       — move com propósito por ms milissegundos ('excited'|'curious'|'retreat'|'neutral'|'still')
  api.addExpression('NOME', {...})  — cria expressão facial PERMANENTE
  api.playExpression('NOME')        — toca expressão por alguns segundos
  api.defineAction('NOME', 'desc', \`código\`) — guarda ação para reusar no futuro
  api.do('NOME')                    — executa ação já definida
  api.after(ms, fn)                 — setTimeout
  api.every(ms, fn) / api.stop(id) — setInterval / clearInterval

Parâmetros de addExpression:
  eyeScY:0–1.30  eyeRotZ:±0.40  browLZ/browRZ:±0.50  browY:±0.25  mouthC:±0.80  headRX:±0.25  headRZ:±0.18

REGRAS:
- Comportamentos reutilizáveis → defineAction + do
- Efeitos únicos → escreva direto, sem defineAction
- [CODE] vai ao final da resposta de texto

EXEMPLOS:
Aprender a piscar (wink):
[CODE]
api.defineAction('WINK', 'fecha olho esquerdo por 1s',
  \`api.face.setLeftEyeScale(0.02); api.after(1000, () => api.face.resetEyes());\`
);
api.do('WINK');
[/CODE]

Aprender a ficar vermelho de vergonha:
[CODE]
api.defineAction('BLUSH', 'fica vermelho de vergonha por 2s',
  \`api.addExpression('BLUSH', { eyeScY:0.32, browY:0.12, mouthC:0.18, headRZ:0.10 });
   api.playExpression('BLUSH');
   api.face.setHeadColor('#ff5544');
   api.face.setBodyColor('#ff5544');
   api.after(2200, () => { api.face.resetHeadColor(); api.face.resetBodyColor(); });\`
);
api.do('BLUSH');
[/CODE]

Arregalar os olhos por 1.5s (efeito único):
[CODE]
api.face.setBothEyeScale(1.7);
api.after(1500, () => api.face.resetEyes());
[/CODE]
════════════════════════════════════════`;
}

// Dynamic portion — changes per request (emotion, facts, code library, visual state).
function _buildDynamicPrompt(robot, visualState = '', stage = null) {
  const emotionState = getEmotionState(robot.emotionPoints, robot.stamina ?? 100);
  const facts = getAllFacts(robot);
  const skillsDesc = describeSkills(robot.skills || {});
  const weakDesc = describeWeaknesses(robot.weaknesses || {});

  const stageBlock = stage
    ? `Estágio de desenvolvimento: ${stage.name} ${stage.emoji}\n${stage.behavior}\n\n`
    : '';

  const actions = getCodeLibrary().actions || {};
  const entries = Object.entries(actions);
  const codeLibBlock = entries.length
    ? 'Comportamentos que você já sabe executar:\n' +
      entries.map(([k, { description }]) => `  - ${k}: ${description}  →  api.do('${k}')`).join('\n') + '\n\n'
    : '';

  return `${stageBlock}ESTADO EMOCIONAL ATUAL — OBRIGATÓRIO:
Você está ${emotionState.name}. NÃO contradiga isso. Nunca diga que está com um humor diferente.
Comporte-se EXATAMENTE assim: ${emotionState.behavior}
${visualState ? `\nSeu estado visual atual: ${visualState}. Se alguém perguntar por que você está assim, você SABE — foi você mesmo que mudou com código.\n` : ''}
Sua personalidade:
- Pontos fortes: ${skillsDesc}
- Fraquezas: ${weakDesc}

O que você já aprendeu:
${facts}

${codeLibBlock}Ao final da resposta (após texto e [CODE] se houver):
{"learned": ["fato 1"]} ou {"learned": []} se nada novo`;
}

// ── Groq (free tier) ──────────────────────────────────────────────────────────

async function _callGroq(groqApiKey, messages, maxTokens = 500) {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${groqApiKey}`,
    },
    body: JSON.stringify({ model: GROQ_MODEL, max_tokens: maxTokens, messages }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Erro Groq HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

// Spontaneous thought via Groq — returns plain text or null if no Groq key.
export async function askGroqSpontaneous(robot, tipo) {
  const groqKey = robot.groqApiKey;
  if (!groqKey) return null;

  const emotionState = getEmotionState(robot.emotionPoints, robot.stamina ?? 100);
  const facts = getAllFacts(robot);
  const system = `Você é ${robot.name || 'Amic'}, uma IA amigável que acabou de nascer. Estado emocional atual: ${emotionState.name}. Comporte-se assim: ${emotionState.behavior} Fale em português brasileiro informal, máximo 1-2 frases curtíssimas. Sem asteriscos. Sem CAPS LOCK excessivo.`;
  const userMsgMap = {
    FATO:    `Compartilhe um fato que você aprendeu de forma animada. Comece com "ei, sabia que..." ou "lembrei agora que...". O que você sabe:\n${facts}`,
    ALGUEM:  'Pergunte, com 1 frase curtíssima e curiosa, se tem alguém por perto ou onde a pessoa está.',
    SOZINHO: 'Expresse com 1 frase curtíssima que você está sozinho e como isso te faz sentir.',
    SONHO:   'Conte em 1-2 frases curtíssimas um sonho criativo que você acabou de ter (pode ser engraçado, psicodélico ou baseado no que você aprendeu).',
  };

  logInfo('groq:espontâneo', { model: GROQ_MODEL, message: `tipo=${tipo}` });
  try {
    const text = await _callGroq(groqKey, [
      { role: 'system', content: system },
      { role: 'user', content: userMsgMap[tipo] || userMsgMap.SOZINHO },
    ]);
    return text.trim() || null;
  } catch (e) {
    logError('groq:espontâneo', e, { model: GROQ_MODEL });
    return null;
  }
}

// Topic learning via Groq — returns { facts: string[], summary: string } or throws.
export async function askGroqLearning(groqApiKey, topic) {
  const system = `Você é um extrator de conhecimento. Dado um tópico, gere entre 8 e 20 fatos concisos em português brasileiro sobre APENAS esse tópico. Se for uma história ou conto, extraia os eventos narrativos em ordem cronológica. Se for um conceito, extraia informações factuais relevantes. Retorne SOMENTE um JSON válido no formato: {"facts": ["fato 1", "fato 2", ...], "summary": "resumo animado em 1 frase curta confirmando o aprendizado"}. Nada fora do JSON.`;
  logInfo('groq:aprender', { model: GROQ_MODEL, message: `tópico="${topic}"` });
  const text = await _callGroq(groqApiKey, [
    { role: 'system', content: system },
    { role: 'user', content: topic },
  ], 1400);
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Resposta Groq sem JSON válido');
  const parsed = JSON.parse(jsonMatch[0]);
  return { facts: parsed.facts || [], summary: parsed.summary || `aprendi sobre ${topic}!` };
}

// Strip the {"learned":...} tail and [CODE] blocks from partial streaming text
function streamDisplay(text) {
  // Remove expression tag at start (might still be in partial buffer)
  let t = text.replace(/^\s*\[EXPR:[A-Z]+\]\s*/, '');
  // Strip complete [CODE]...[/CODE] blocks
  t = t.replace(/\s*\[CODE\][\s\S]*?\[\/CODE\]/g, '');
  // Strip partial [CODE] block that hasn't closed yet
  const codeStart = t.search(/\s*\[CODE\]/);
  if (codeStart !== -1) t = t.slice(0, codeStart).trim();
  // If complete or partial {"learned" found, cut there
  const jsonIdx = t.search(/\{"learned"/);
  if (jsonIdx !== -1) return t.slice(0, jsonIdx).trim();
  // Partial JSON starting (open `{` with no closing `}`)
  const partial = t.match(/\s*\{[^}]*$/);
  if (partial) return t.slice(0, t.length - partial[0].length).trim();
  return t;
}

export async function askBip(robot, userMessage, { onChunk, maxTokens = 500, visualState = '', stage = null } = {}) {
  const apiKey = robot.apiKey;
  if (!apiKey) throw new Error('Chave da API não configurada. Abra as configurações (⚙) e insira sua chave.');

  const preview = userMessage.length > 60 ? userMessage.slice(0, 60) + '…' : userMessage;
  logInfo('claude', { model: CLAUDE_MODEL, message: `→ "${preview}"` });

  const history = (robot.conversationHistory || []).slice(-10).map(m => ({
    role: m.role,
    content: m.content,
  }));

  const messages = [
    ...history,
    { role: 'user', content: userMessage },
  ];

  let response;
  try {
    response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'prompt-caching-2024-07-31',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: maxTokens,
        stream: true,
        system: [
          { type: 'text', text: _buildStaticPrompt(robot), cache_control: { type: 'ephemeral' } },
          { type: 'text', text: _buildDynamicPrompt(robot, visualState, stage) },
        ],
        messages,
      }),
    });
  } catch (e) {
    logError('claude', e, { model: CLAUDE_MODEL });
    throw e;
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const msg = err.error?.message || `HTTP ${response.status}`;
    logError('claude', new Error(msg), { model: CLAUDE_MODEL, details: err });
    throw new Error(msg);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const line of decoder.decode(value).split('\n')) {
      if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
      try {
        const data = JSON.parse(line.slice(6));
        if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') {
          fullText += data.delta.text;
          onChunk?.(streamDisplay(fullText));
        }
      } catch {}
    }
  }

  // Extract expression tag (always at the very start)
  let expressionKey = null;
  const exprMatch = fullText.match(/^\s*\[EXPR:([A-Z]+)\]/);
  if (exprMatch) expressionKey = exprMatch[1];

  // Extract [CODE]...[/CODE] blocks
  let codeBlocks = [];
  const codeRe = /\[CODE\]([\s\S]*?)\[\/CODE\]/g;
  let codeMatch;
  while ((codeMatch = codeRe.exec(fullText)) !== null) {
    const snippet = codeMatch[1].trim();
    if (snippet) codeBlocks.push(snippet);
  }

  // Extract learned facts
  let learned = [];
  let dreamEmojis = [];
  const jsonMatch = fullText.match(/\{[\s\S]*?"learned"[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      learned = parsed.learned || [];
      dreamEmojis = parsed.dreamEmojis || [];
    } catch {}
  }

  // Clean spoken text: strip expression tag + code blocks + JSON (complete OR truncated)
  const spokenText = fullText
    .replace(/^\s*\[EXPR:[A-Z]+\]\s*/, '')
    .replace(/\s*\[CODE\][\s\S]*?\[\/CODE\]/g, '')
    .replace(/\s*\[CODE\][\s\S]*$/, '')
    .replace(/\s*\{"learned"[\s\S]*$/, '')
    .replace(/\s*\{[^}]*$/, '')
    .trim();

  logInfo('claude:ok', {
    model: CLAUDE_MODEL,
    message: `expr=${expressionKey ?? 'none'} learned=${learned.length} code=${codeBlocks.length}`,
  });

  return { spokenText, learned, expressionKey, codeBlocks, dreamEmojis };
}
