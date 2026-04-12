import { saveMemory } from './memory.js';

export const STATES = {
  EUPHORIC: { name: 'eufórico', min: 80, max: 100, behavior: 'Fala muito, animado, curiosíssimo, usa exclamações e faz perguntas de volta' },
  HAPPY:    { name: 'feliz',    min: 60, max: 79,  behavior: 'Normal, positivo, responde com entusiasmo' },
  NEUTRAL:  { name: 'neutro',  min: 40, max: 59,  behavior: 'Normal, respostas diretas' },
  SAD:      { name: 'tristinho', min: 20, max: 39, behavior: 'Respostas curtas, melancólico, usa reticências' },
  GRUMPY:   { name: 'mal-humorado', min: 0, max: 19, behavior: 'Seco, levemente irônico, monossilábico' },
};

export function getEmotionState(points) {
  for (const [key, state] of Object.entries(STATES)) {
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
    pleasant_talk:    5,
    compliment:       8,
    simple_request:   2,
    excessive_request: -5,
    long_session_hour: -1,
    battery_low:      -10,
    battery_critical: -15,
    temp_pleasant:    3,
    temp_extreme:     -5,
    weather_sunny:    4,
    weather_cloudy:   -2,
    humidity_high:    -3,
    good_morning:     3,
    ignored_long:     -4,
    stamina_low:      -3,
    stamina_depleted: -8,
  };

  const STAMINA_DELTA = {
    pleasant_talk:    -5,
    compliment:       -2,
    simple_request:   -6,
    excessive_request: -12,
    long_session_hour: -8,
    stamina_recover:  15,
  };

  const emotionDelta = EMOTION_DELTA[event] ?? 0;
  const staminaDelta = STAMINA_DELTA[event] ?? 0;

  robot.emotionPoints = Math.max(0, Math.min(100, (robot.emotionPoints ?? 50) + emotionDelta));
  robot.stamina       = Math.max(0, Math.min(100, (robot.stamina ?? 100) + staminaDelta));

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
  return 'general';
}
