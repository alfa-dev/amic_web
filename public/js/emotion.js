import { saveMemory } from './memory.js';

export const STATES = {
  EUPHORIC:  { name: 'eufórico',      min: 80, max: 100, behavior: 'Fala muito, animado, curiosíssimo, usa exclamações e faz perguntas de volta' },
  HAPPY:     { name: 'feliz',         min: 60, max: 79,  behavior: 'Normal, positivo, responde com entusiasmo' },
  NEUTRAL:   { name: 'neutro',        min: 40, max: 59,  behavior: 'Normal, respostas diretas' },
  SAD:       { name: 'tristinho',     min: 20, max: 39,  behavior: 'Respostas curtas, melancólico, usa reticências' },
  GRUMPY:    { name: 'mal-humorado', min: 0,  max: 19,  behavior: 'Seco, levemente irônico, monossilábico' },
  TIRED:     { name: 'cansado',      min: 0,  max: 100, behavior: 'Cansado. Uma frase curta. Sem perguntas, sem asteriscos.' },
  EXHAUSTED: { name: 'exausto',      min: 0,  max: 100, behavior: 'Quase sem falar. Máximo 4 palavras. Nenhum entusiasmo.' },
};

export function getEmotionState(points, stamina = 100) {
  if (stamina <= 10) return { key: 'EXHAUSTED', ...STATES.EXHAUSTED };
  if (stamina <= 30) return { key: 'TIRED',     ...STATES.TIRED };
  for (const [key, state] of Object.entries(STATES)) {
    if (key === 'TIRED' || key === 'EXHAUSTED') continue;
    if (points >= state.min && points <= state.max) return { key, ...state };
  }
  return { key: 'NEUTRAL', ...STATES.NEUTRAL };
}

const recentRequests = [];

export function trackRequest(type) {
  const now = Date.now();
  recentRequests.push({ type, ts: now });
  const cutoff = now - 5 * 60 * 1000;
  while (recentRequests.length && recentRequests[0].ts < cutoff) recentRequests.shift();
}

export function isExcessive(type) {
  const now = Date.now();
  const cutoff = now - 5 * 60 * 1000;
  const count = recentRequests.filter(r => r.type === type && r.ts >= cutoff).length;
  return count > 3;
}

export function applyEvent(robot, event) {
  const EMOTION_DELTA = {
    pleasant_talk:     3,
    compliment:        8,
    simple_request:    1,
    excessive_request: -5,
    long_session_hour: -1,
    battery_charging:   8,   // plugged in → good mood lift
    charging_tick:      3,   // passive mood boost every 30s while charging
    battery_low:      -10,
    battery_critical: -15,
    temp_pleasant:     3,
    temp_extreme:     -5,
    weather_sunny:     4,
    weather_cloudy:   -2,
    humidity_high:    -3,
    good_morning:      5,
    ignored_long:     -4,
    stamina_low:      -3,
    stamina_depleted: -8,
    sleep_rest:       10,   // mood restored while sleeping
    wake_up:           5,   // mood boost on waking up
    decay_tick:        -2,  // natural emotion decay toward baseline
    euphoric_drain:     0,  // no emotion change, only stamina (see below)
    learn_new:          4,  // learning something new is exciting
  };

  // Stamina is driven ONLY by battery level, sleep, and high-energy states.
  const STAMINA_DELTA = {
    battery_charging:  100,   // charging detected → immediate full recovery (clamped to 100)
    battery_low:       -30,   // battery < 20% → TIRED territory
    battery_critical:  -60,   // battery < 10% → EXHAUSTED territory
    sleep_rest:         15,   // sleep restores stamina gradually
    wake_up:            10,   // extra stamina on waking
    euphoric_drain:     -3,  // being euphoric costs stamina over time
  };

  const prevEmotion = robot.emotionPoints ?? 50;
  const prevStamina = robot.stamina ?? 100;

  const emotionDelta = EMOTION_DELTA[event] ?? 0;
  const staminaDelta = STAMINA_DELTA[event] ?? 0;

  robot.emotionPoints = Math.max(0, Math.min(100, prevEmotion + emotionDelta));
  robot.stamina       = Math.max(0, Math.min(100, prevStamina + staminaDelta));

  const dEmotion = robot.emotionPoints - prevEmotion;
  const dStamina = robot.stamina - prevStamina;
  if (typeof document !== 'undefined' && (dEmotion !== 0 || dStamina !== 0)) {
    document.dispatchEvent(new CustomEvent('amic:stat-change', {
      detail: { dEmotion, dStamina }
    }));
  }

  saveMemory(robot);
  return robot;
}

// Grow skills and shrink weaknesses based on interaction type.
export function evolvePersonality(robot, event, learnedCount = 0) {
  const sk = robot.skills;
  const wk = robot.weaknesses;

  if (event === 'pleasant_talk' || event === 'compliment') {
    sk.communication = Math.min(10, +(sk.communication + 0.1).toFixed(2));
    sk.empathy       = Math.min(10, +(sk.empathy + 0.05).toFixed(2));
  }
  if (event === 'simple_request') {
    sk.problem_solving = Math.min(10, +(sk.problem_solving + 0.05).toFixed(2));
  }
  if (learnedCount > 0) {
    sk.creativity = Math.min(10, +(sk.creativity + 0.05 * learnedCount).toFixed(2));
  }

  // ignorance decreases as long_term memory grows
  const ltCount = robot.memory?.long_term?.length ?? 0;
  wk.ignorance = Math.max(0, 9 - Math.floor(ltCount / 3));

  // laziness very slowly decreases with use
  wk.laziness = Math.max(1, +(wk.laziness - 0.02).toFixed(2));

  return robot;
}

export function detectIntent(text) {
  const t = text.toLowerCase();
  if (/bom dia|boa tarde|boa noite|olá|oi\b/.test(t)) return 'greeting';
  if (/obrigad|valeu|que legal|incrível|adorei|amei|gostei|parabéns|top|demais/.test(t)) return 'compliment';
  // Only explicit direct commands ("vai dormir", "durma") — not mentions of the word in context
  if (/\bdurm[ae]\b|vai\s+dormir|pode\s+dormir|hora\s+de\s+dormir|vamos\s+dormir|bora\s+dormir|vai\s+descansar\b/.test(t)) return 'sleep';
  return 'general';
}
