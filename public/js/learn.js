const API_URL = 'https://api.anthropic.com/v1/messages';

// Detect if the user is asking Amic to learn about a topic.
// Returns the topic string, or null if not a learn request.
export function detectLearnRequest(text) {
  const t = text.trim();
  const match = t.match(
    /(?:aprend[ea](?:r)?|pesquis[ae](?:r)?)\s+(?:sobre\s+|a\s+hist[oó]ria\s+d[aoe]?\s+|a\s+historinha\s+d[aoe]?\s+|o\s+que\s+[eé]\s+)?(.+)/i
  );
  if (!match) return null;
  return match[1].trim().replace(/[?!.,]+$/, '').trim() || null;
}

// Fetch structured facts about a topic from Claude.
// Returns { facts: string[], summary: string }
export async function learnAbout(apiKey, topic) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1400,
      system: `Você é um extrator de conhecimento. Dado um tópico, gere entre 8 e 20 fatos concisos em português brasileiro sobre APENAS esse tópico. Se for uma história ou conto, extraia os eventos narrativos em ordem cronológica. Se for um conceito, extraia informações factuais relevantes. Retorne SOMENTE um JSON válido no formato: {"facts": ["fato 1", "fato 2", ...], "summary": "resumo animado em 1 frase curta confirmando o aprendizado"}. Nada fora do JSON.`,
      messages: [{ role: 'user', content: topic }],
    }),
  });

  if (!res.ok) throw new Error(`Erro ${res.status}`);
  const data = await res.json();
  const parsed = JSON.parse(data.content[0].text);
  return { facts: parsed.facts || [], summary: parsed.summary || `aprendi sobre ${topic}!` };
}
