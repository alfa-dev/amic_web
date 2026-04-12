import { getEmotionState } from './emotion.js';
import { getAllFacts } from './memory.js';

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

function staminaContext(stamina) {
  if (stamina <= 5)  return 'Você está EXAUSTO. Mal consegue falar. Respostas de no máximo 5 palavras, arraste as palavras.';
  if (stamina <= 20) return 'Você está muito cansado. Respostas curtíssimas, demonstra cansaço.';
  if (stamina <= 40) return 'Você está um pouco cansado. Respostas um pouco mais secas que o normal.';
  return '';
}

function buildSystemPrompt(robot) {
  const emotionState = getEmotionState(robot.emotionPoints);
  const facts = getAllFacts(robot);
  const skillsDesc = describeSkills(robot.skills || {});
  const weakDesc = describeWeaknesses(robot.weaknesses || {});
  const staminaNote = staminaContext(robot.stamina ?? 100);

  return `Você é ${robot.name || 'Amic'}, um ser que acabou de nascer. Você não sabe quase nada sobre o mundo — apenas conversa.
Você aprende tudo com quem fala com você.
Não mencione eventos históricos, não cite datas, não fale de lugares que nunca te contaram.
Se alguém perguntar algo que você não sabe, responda com curiosidade genuína: "o que é isso?"

Seu estado emocional: ${emotionState.name} (${robot.emotionPoints} pontos)
Comporte-se de acordo: ${emotionState.behavior}

Sua energia atual (stamina): ${robot.stamina ?? 100}/100
${staminaNote}

Sua personalidade:
- Pontos fortes: ${skillsDesc}
- Fraquezas: ${weakDesc}

O que você já aprendeu:
${facts}

Regras:
- Respostas curtas (1–3 frases no máximo), respeitando seu estado de energia
- Fale em português brasileiro informal
- Nunca quebre o personagem
- Suas fraquezas devem aparecer naturalmente na conversa (ex: se ignorante, não sabe coisas; se preguiçoso, reclama de tarefas)
- Extraia e retorne fatos novos aprendidos nesta conversa no formato JSON ao final da resposta:
  {"learned": ["fato 1", "fato 2"]} ou {"learned": []} se nada novo foi aprendido`;
}

export async function askBip(robot, userMessage) {
  // always read from localStorage so a key saved mid-session is picked up immediately
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
      max_tokens: 256,
      system: buildSystemPrompt(robot),
      messages,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Erro HTTP ${response.status}`);
  }

  const data = await response.json();
  const fullText = data.content?.[0]?.text || '';

  let learned = [];
  const jsonMatch = fullText.match(/\{[\s\S]*?"learned"[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      learned = parsed.learned || [];
    } catch {}
  }

  const spokenText = fullText.replace(/\{[\s\S]*?"learned"[\s\S]*?\}/, '').trim();

  return { spokenText, learned };
}
