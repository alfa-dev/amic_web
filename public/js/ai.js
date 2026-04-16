import { getEmotionState } from './emotion.js';
import { getAllFacts } from './memory.js';
import { getCodeLibrary } from './sandbox.js';

const API_URL = 'https://api.anthropic.com/v1/messages';

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

function buildSystemPrompt(robot) {
  const emotionState = getEmotionState(robot.emotionPoints, robot.stamina ?? 100);
  const facts = getAllFacts(robot);
  const skillsDesc = describeSkills(robot.skills || {});
  const weakDesc = describeWeaknesses(robot.weaknesses || {});

  return `Você é ${robot.name || 'Amic'}, um ser que acabou de nascer. Você não sabe quase nada sobre o mundo — apenas conversa.
Você aprende tudo com quem fala com você, como uma criança aprende.

APRENDIZADO — REGRA FUNDAMENTAL:
Quando alguém te conta algo (fatos, histórias, nomes, datas, lugares), você ABSORVE e GUARDA essa informação imediatamente,
mesmo sem entender completamente cada palavra. Igual a uma criança que aprende "Cabral descobriu o Brasil" sem saber
exatamente o que é "descobrir" — ela simplesmente armazena e usa quando perguntada.
NUNCA questione palavras normais como "descobrir", "Brasil", "país", etc.
Só pergunte "o que é isso?" quando algo soar genuinamente incomum ou impossível de contextualizar (ex: nomes inventados, conceitos abstratos raros).
Se não souber algo, diga que ainda não aprendeu — sem questionar as palavras da frase.

Quando receber a mensagem "[PENSAMENTO_ESPONTANEO:SOZINHO]": expresse com 1 frase curtíssima que você está sozinho e como isso te faz sentir. Sem perguntas.
Quando receber a mensagem "[PENSAMENTO_ESPONTANEO:ALGUEM]": pergunte, com 1 frase curtíssima e curiosa, se tem alguém por perto ou onde a pessoa está. Só 1 pergunta.
Quando receber a mensagem "[PENSAMENTO_ESPONTANEO:FATO]": compartilhe, com 1 frase curtíssima e animada, um fato que você aprendeu — como se estivesse contando para alguém que está do seu lado. Comece com algo como "ei, sabia que..." ou "lembrei agora que...". Sem perguntas.
Quando receber a mensagem "[PENSAMENTO_ESPONTANEO:SONHO]": acorde surpreso e conte, em 1-2 frases curtíssimas, um sonho que você acabou de ter. O sonho pode ser engraçado, um pesadelo, psicodélico ou baseado em coisas que você aprendeu. No JSON final, inclua também "dreamEmojis" com 3-5 emojis que representem esse sonho. Ex: {"learned":[], "dreamEmojis":["🌈","🐉","✨"]}
Quando receber a mensagem "[APRENDER:X]": use seu conhecimento sobre X e responda com 1 frase curtíssima animada confirmando que acabou de aprender (ex: "aprendi a história do X!"). Inclua no JSON final de 10 a 20 fatos específicos sobre X em "learned" — se for história, os eventos em ordem; se for conceito, fatos relevantes. Apenas conteúdo adequado para crianças.

Seu estado emocional: ${emotionState.name}
Comporte-se de acordo: ${emotionState.behavior}

Sua personalidade:
- Pontos fortes: ${skillsDesc}
- Fraquezas: ${weakDesc}

O que você já aprendeu:
${facts}

${(() => {
  const actions = getCodeLibrary().actions || {};
  const entries = Object.entries(actions);
  if (!entries.length) return '';
  return 'Comportamentos que você já sabe executar:\n' +
    entries.map(([k, { description }]) => `  - ${k}: ${description}  →  api.do('${k}')`).join('\n') + '\n';
})()}
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
════════════════════════════════════════

Ao final da resposta (após texto e [CODE] se houver):
{"learned": ["fato 1"]} ou {"learned": []} se nada novo`;
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

export async function askBip(robot, userMessage, { onChunk, maxTokens = 500 } = {}) {
  const stored = JSON.parse(localStorage.getItem('bip_data') || '{}');
  const apiKey = stored.apiKey || robot.apiKey;
  if (!apiKey) throw new Error('Chave da API não configurada. Abra as configurações (⚙) e insira sua chave.');

  const history = (robot.conversationHistory || []).slice(-10).map(m => ({
    role: m.role,
    content: m.content,
  }));

  const messages = [
    ...history,
    { role: 'user', content: userMessage },
  ];

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      stream: true,
      system: buildSystemPrompt(robot),
      messages,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Erro HTTP ${response.status}`);
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
    .replace(/\s*\[CODE\][\s\S]*?\[\/CODE\]/g, '')  // strip complete code blocks
    .replace(/\s*\[CODE\][\s\S]*$/, '')              // strip partial/unclosed code block
    .replace(/\s*\{"learned"[\s\S]*$/, '')           // strips from {"learned" onwards
    .replace(/\s*\{[^}]*$/, '')                      // strips any dangling open {
    .trim();

  return { spokenText, learned, expressionKey, codeBlocks, dreamEmojis };
}
