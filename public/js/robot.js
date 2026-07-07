import { loadMemory, saveMemory, addFact, addConversation, ageFacts } from './memory.js';
import { applyEvent, evolvePersonality, detectIntent, trackRequest, isExcessive, getEmotionState } from './emotion.js';
import { askBip, askGroqSpontaneous, askGroqLearning } from './ai.js';
import { detectLearnRequest } from './learn.js';
import { speak } from './voice.js';
import { setExpression, playExpression, setMovementSpeed, setWalkIntent, setWalkIntentTimed, getVisualStateDesc, registerExpression, getFaceAPI } from './face.js';
import { startBatteryMonitoring } from './battery.js';
import { getCoords, startWeatherMonitoring } from './weather.js';
import { initSandbox, executeSandboxCode, getCodeLibrary, resetCodeLibrary } from './sandbox.js';

// Movement speed per emotion key (1.0 = normal)
const EMOTION_SPEEDS = {
  HAPPY:     1.2,
  EXCITED:   1.8,
  DELIGHTED: 1.5,
  CURIOUS:   1.1,
  NEUTRAL:   1.0,
  THINKING:  0.7,
  WORRIED:   0.8,
  BORED:     0.5,
  TIRED:     0.3,
  EXHAUSTED: 0.15,
};

// ── Growth stages ─────────────────────────────────────────────────────────────
export const STAGES = [
  {
    key:       'NEWBORN',
    name:      'recém-nascido',
    minMinutes: 0,
    minFacts:  0,
    emoji:     '🍼',
    behavior:  'Você tem poucos dias de vida. Usa palavras simples, faz frases curtíssimas, se assusta facilmente, não entende muita coisa ainda. Máximo 1 frase por resposta.',
    spontaneousTypes: ['ALGUEM'],
  },
  {
    key:       'CHILD',
    name:      'criança',
    minMinutes: 60,
    minFacts:  10,
    emoji:     '🌱',
    behavior:  'Você é uma criança curiosa. Faz perguntas o tempo todo, se anima com coisas novas, aprende rápido, é inocente e entusiasmado.',
    spontaneousTypes: ['ALGUEM', 'FATO', 'SOZINHO'],
  },
  {
    key:       'TEEN',
    name:      'adolescente',
    minMinutes: 300,
    minFacts:  40,
    emoji:     '🌿',
    behavior:  'Você é um adolescente. Tem opiniões próprias, às vezes questiona, humor mais complexo, pode ser levemente irônico quando irritado.',
    spontaneousTypes: ['ALGUEM', 'FATO', 'SOZINHO'],
  },
  {
    key:       'ADULT',
    name:      'adulto',
    minMinutes: 900,
    minFacts:  80,
    emoji:     '🌳',
    behavior:  'Você é um adulto maduro. Faz reflexões mais profundas, referencia memórias de conversas passadas, é ponderado e empático.',
    spontaneousTypes: ['ALGUEM', 'FATO', 'SOZINHO'],
  },
];

export function computeStage(st) {
  const minutes = st.totalTalkMinutes ?? 0;
  const facts   = (st.memory?.long_term?.length ?? 0) +
                  (st.memory?.medium_term?.length ?? 0);
  let stage = STAGES[0];
  for (const s of STAGES) {
    if (minutes >= s.minMinutes && facts >= s.minFacts) stage = s;
  }
  return stage;
}

// Expression key → walk intent + duration when AI picks that expression
const EXPR_WALK = {
  EXCITED:   { intent: 'excited',  ms: 7000 },
  DELIGHTED: { intent: 'excited',  ms: 5000 },
  LAUGHING:  { intent: 'excited',  ms: 4000 },
  HAPPY:     { intent: 'curious',  ms: 4000 },
  CURIOUS:   { intent: 'curious',  ms: 5000 },
  SURPRISED: { intent: 'curious',  ms: 2500 },
  WORRIED:   { intent: 'retreat',  ms: 6000 },
  GRUMPY:    { intent: 'retreat',  ms: 8000 },
  BORED:     { intent: 'neutral',  ms: 5000 },
  CONFUSED:  { intent: 'neutral',  ms: 3000 },
};

function _walkFromExpression(expressionKey) {
  const w = EXPR_WALK[expressionKey];
  if (w) setWalkIntentTimed(w.intent, w.ms);
}

let state = loadMemory();
let svgEl = null;
let _isSleeping = false;
let _sleepInterval = null;
let _lastStageKey = null;

// Support multiple listeners (onRobotChange can be called several times)
const _stateListeners = [];

export function getRobot()      { return state; }
export function isSleeping()    { return _isSleeping; }
export function getRobotStage() { return computeStage(state); }
export { getCodeLibrary, resetCodeLibrary };

export function setRobot(newState) {
  state = newState;
  saveMemory(state);
  notifyChange();
}

export function onRobotChange(cb) {
  _stateListeners.push(cb);
}

function notifyChange() {
  if (svgEl && !_isSleeping) {
    const s = getEmotionState(state.emotionPoints, state.stamina ?? 100);
    setExpression(svgEl, s.key);
    setMovementSpeed(EMOTION_SPEEDS[s.key] ?? 1.0);
  }

  // Stage transition detection
  const currentStage = computeStage(state);
  if (_lastStageKey !== null && _lastStageKey !== currentStage.key) {
    document.dispatchEvent(new CustomEvent('amic:stage-up', {
      detail: { stage: currentStage }
    }));
  }
  _lastStageKey = currentStage.key;

  _stateListeners.forEach(cb => cb(state));
}

export function initRobot(svg, changeCb) {
  svgEl = svg;
  if (changeCb) _stateListeners.push(changeCb);

  state = loadMemory();
  state.sessionStart = Date.now();
  saveMemory(state);

  // Seed stage key so first notifyChange() doesn't fire a false stage-up
  _lastStageKey = computeStage(state).key;

  // Init sandbox — replay expression + action registrations on startup
  initSandbox({ registerExpression, getFaceAPI, playExpression });

  notifyChange();

  // session fatigue: -emotion after 1h continuous
  setInterval(() => {
    const elapsed = Date.now() - state.sessionStart;
    if (elapsed > 60 * 60 * 1000) {
      state = applyEvent(state, 'long_session_hour');
      state.totalTalkMinutes += 60;
      state.sessionStart = Date.now();
      saveMemory(state);
      notifyChange();
    }
  }, 5 * 60 * 1000);

  // ignored for > 2h
  setInterval(() => {
    const last = state.conversationHistory?.slice(-1)[0];
    if (last && Date.now() - last.ts > 2 * 60 * 60 * 1000) {
      state = applyEvent(state, 'ignored_long');
      notifyChange();
    }
  }, 30 * 60 * 1000);

  // stamina low/depleted warnings
  setInterval(() => {
    const stamina = state.stamina ?? 100;
    if (stamina <= 5) {
      state = applyEvent(state, 'stamina_depleted');
      notifyChange();
    } else if (stamina <= 20) {
      state = applyEvent(state, 'stamina_low');
      notifyChange();
    }
  }, 10 * 60 * 1000);

  // Emotion decay toward baseline (60) + euphoric stamina drain every 8 min
  setInterval(() => {
    if (_isSleeping) return;
    const emotionState = getEmotionState(state.emotionPoints, state.stamina ?? 100);
    // Only decay if above baseline (60)
    if ((state.emotionPoints ?? 50) > 60) {
      state = applyEvent(state, 'decay_tick');
      notifyChange();
    }
    // Euphoria costs stamina
    if (emotionState.key === 'EUPHORIC') {
      state = applyEvent(state, 'euphoric_drain');
      notifyChange();
    }
  }, 8 * 60 * 1000);

  startBatteryMonitoring(getRobot, setRobot);

  getCoords()
    .then(coords => startWeatherMonitoring(getRobot, setRobot, coords))
    .catch(() => console.info('Geolocalização não disponível'));

  // Spontaneous thoughts: Amic speaks on his own every 5–20 min
  async function doSpontaneousThought() {
    if (!state.apiKey && !state.groqApiKey) return;
    // Don't interrupt if mic is active
    if (typeof document !== 'undefined' && document.getElementById('mic-btn')?.classList.contains('listening')) return;

    // Sleeping: maybe wake up to tell a dream (only if stamina > 40, 35% chance)
    if (_isSleeping) {
      const stamina = state.stamina ?? 100;
      if (stamina < 40) return;
      if (Math.random() > 0.35) return;
      try {
        let spokenText, expressionKey, dreamEmojis;
        const groqText = await askGroqSpontaneous(state, 'SONHO');
        if (groqText) {
          spokenText = groqText;
          expressionKey = 'SURPRISED';
          dreamEmojis = [];
        } else {
          const result = await askBip(state, '[PENSAMENTO_ESPONTANEO:SONHO]', { visualState: getVisualStateDesc(), stage: computeStage(state) });
          if (!result?.spokenText) return;
          ({ spokenText, expressionKey, dreamEmojis = [] } = result);
        }
        wakeUp();
        state = addConversation(state, 'assistant', spokenText);
        saveMemory(state);
        notifyChange();
        document.dispatchEvent(new CustomEvent('amic:dream', {
          detail: { text: spokenText, expressionKey, dreamEmojis }
        }));
      } catch {}
      return;
    }

    const emotionState = getEmotionState(state.emotionPoints, state.stamina ?? 100);
    if (emotionState.key === 'EXHAUSTED') return;
    try {
      const lastMsg = state.conversationHistory?.slice(-1)[0];
      const recentConv = lastMsg && (Date.now() - lastMsg.ts < 20 * 60 * 1000);
      const stage = computeStage(state);
      const availableTypes = recentConv ? stage.spontaneousTypes : ['ALGUEM'];
      const tipo = availableTypes[Math.floor(Math.random() * availableTypes.length)];

      let spokenText, expressionKey;
      const groqText = await askGroqSpontaneous(state, tipo);
      if (groqText) {
        spokenText = groqText;
        const exprMap = { FATO: 'EXCITED', ALGUEM: 'CURIOUS', SOZINHO: 'WORRIED', SONHO: 'SURPRISED' };
        expressionKey = exprMap[tipo] || 'NONE';
      } else {
        const result = await askBip(state, `[PENSAMENTO_ESPONTANEO:${tipo}]`, { visualState: getVisualStateDesc(), stage });
        if (!result?.spokenText) return;
        ({ spokenText, expressionKey } = result);
      }

      state = addConversation(state, 'assistant', spokenText);
      saveMemory(state);
      notifyChange();
      if (expressionKey && expressionKey !== 'NONE') {
        _walkFromExpression(expressionKey);
      }
      document.dispatchEvent(new CustomEvent('amic:spontaneous', {
        detail: { text: spokenText, expressionKey }
      }));
    } catch {}
  }

  function scheduleNextThought() {
    const delay = (5 + Math.random() * 15) * 60 * 1000; // 5–20 min
    setTimeout(async () => { await doSpontaneousThought(); scheduleNextThought(); }, delay);
  }
  scheduleNextThought();
}

export function startSleep() {
  if (_isSleeping) return;
  _isSleeping = true;
  if (svgEl) {
    setExpression(svgEl, 'SLEEPING', false);
    setMovementSpeed(0.05);
    setWalkIntent('still');
  }
  document.dispatchEvent(new CustomEvent('amic:sleep', { detail: { sleeping: true } }));
  // Gradually restore stats while sleeping (every 30s)
  _sleepInterval = setInterval(() => {
    state = applyEvent(state, 'sleep_rest');
    saveMemory(state);
    notifyChange();
  }, 30 * 1000);
}

export function wakeUp() {
  if (!_isSleeping) return;
  _isSleeping = false;
  if (_sleepInterval) { clearInterval(_sleepInterval); _sleepInterval = null; }
  state = applyEvent(state, 'wake_up');
  if (svgEl) {
    const s = getEmotionState(state.emotionPoints, state.stamina ?? 100);
    setExpression(svgEl, s.key, false);
    setMovementSpeed(EMOTION_SPEEDS[s.key] ?? 1.0);
  }
  saveMemory(state);
  notifyChange();
  document.dispatchEvent(new CustomEvent('amic:sleep', { detail: { sleeping: false } }));
}

export async function handleUserMessage(text, voiceOptions = {}) {
  if (!text?.trim()) return;

  // ── Learn intent: "aprenda sobre X" — usa o conhecimento interno da LLM ───────
  const learnTopic = detectLearnRequest(text);
  if (learnTopic) {
    state = applyEvent(state, 'simple_request');
    notifyChange();
    document.dispatchEvent(new CustomEvent('amic:learning', { detail: { topic: learnTopic } }));
    try {
      let result;
      if (state.groqApiKey) {
        const { facts, summary } = await askGroqLearning(state.groqApiKey, learnTopic);
        result = { spokenText: summary, learned: facts, expressionKey: 'EXCITED', codeBlocks: [] };
      } else {
        result = await askBip(state, `[APRENDER:${learnTopic}]`, {
          onChunk: voiceOptions.onChunk,
          maxTokens: 1200,
          visualState: getVisualStateDesc(),
          stage: computeStage(state),
        });
      }
      const { spokenText, learned, expressionKey, codeBlocks = [] } = result;
      for (const fact of learned) state = addFact(state, fact, 2);
      state = evolvePersonality(state, 'simple_request', learned.length);
      state = ageFacts(state);
      state = applyEvent(state, 'learn_new');
      state = addConversation(state, 'user', text);
      state = addConversation(state, 'assistant', spokenText);
      state = applyEvent(state, 'pleasant_talk');
      saveMemory(state);
      notifyChange();
      if (learned.length > 0) {
        document.dispatchEvent(new CustomEvent('amic:learned', { detail: { count: learned.length } }));
      }
      if (svgEl) {
        if (expressionKey && expressionKey !== 'NONE') {
          playExpression(expressionKey);
          _walkFromExpression(expressionKey);
        }
        const s = getEmotionState(state.emotionPoints, state.stamina ?? 100);
        setExpression(svgEl, s.key, true);
      }
      await speak(spokenText, {
        ...voiceOptions,
        emotionKey: expressionKey || '',
        onEnd: () => {
          if (svgEl) {
            const s = getEmotionState(state.emotionPoints, state.stamina ?? 100);
            setExpression(svgEl, s.key, false);
          }
          voiceOptions.onEnd?.();
        },
      });
      return { spokenText, learned };
    } catch (e) {
      const errMsg = e.message || `não consegui aprender sobre ${learnTopic} agora...`;
      await speak(errMsg, voiceOptions);
      return { error: errMsg };
    }
  }

  const intent = detectIntent(text);
  trackRequest(intent);

  // Wake up if sleeping and user says anything
  if (_isSleeping) {
    wakeUp();
    if (intent === 'sleep') return { spokenText: '' };
    // slight pause so expression can change before AI responds
    await new Promise(r => setTimeout(r, 400));
  }

  // Handle sleep command directly
  if (intent === 'sleep') {
    startSleep();
    state = addConversation(state, 'user', text);
    state = addConversation(state, 'assistant', 'ZZZzzz...');
    saveMemory(state);
    notifyChange();
    return { spokenText: '' };
  }

  if (isExcessive(intent)) {
    state = applyEvent(state, 'excessive_request');
  } else if (intent === 'compliment') {
    state = applyEvent(state, 'compliment');
    state = evolvePersonality(state, 'compliment');
  } else if (intent === 'greeting') {
    if (/bom dia/.test(text.toLowerCase())) state = applyEvent(state, 'good_morning');
    else state = applyEvent(state, 'pleasant_talk');
    state = evolvePersonality(state, 'pleasant_talk');
  } else {
    state = applyEvent(state, 'simple_request');
    state = evolvePersonality(state, 'simple_request');
  }

  notifyChange();

  if (svgEl) {
    const s = getEmotionState(state.emotionPoints, state.stamina ?? 100);
    setExpression(svgEl, s.key, false);
  }

  let response;
  try {
    response = await askBip(state, text, { onChunk: voiceOptions.onChunk, visualState: getVisualStateDesc(), stage: computeStage(state) });
  } catch (e) {
    const errMsg = e.message || 'Algo deu errado...';
    await speak(errMsg, voiceOptions);
    return { error: errMsg };
  }

  const { spokenText, learned, expressionKey, codeBlocks = [] } = response;

  // Execute code blocks the robot wrote (new expressions, color changes, etc.)
  for (let i = 0; i < codeBlocks.length; i++) {
    executeSandboxCode(codeBlocks[i], `msg_${Date.now()}_${i}`);
  }

  // Add learned facts to tiered memory
  for (const fact of learned) {
    state = addFact(state, fact, 1);
  }
  if (learned.length > 0 && typeof document !== 'undefined') {
    document.dispatchEvent(new CustomEvent('amic:learned', {
      detail: { count: learned.length }
    }));
  }

  state = evolvePersonality(state, 'pleasant_talk', learned.length);
  state = ageFacts(state);

  // Add both messages to history AFTER response
  state = addConversation(state, 'user', text);
  state = addConversation(state, 'assistant', spokenText);
  state = applyEvent(state, 'pleasant_talk');
  saveMemory(state);
  notifyChange();

  if (svgEl) {
    if (expressionKey && expressionKey !== 'NONE') {
      playExpression(expressionKey);
      _walkFromExpression(expressionKey);
    }
    const s = getEmotionState(state.emotionPoints, state.stamina ?? 100);
    setExpression(svgEl, s.key, true);
  }

  await speak(spokenText, {
    ...voiceOptions,
    emotionKey: expressionKey || '',
    onEnd: () => {
      if (svgEl) {
        const s = getEmotionState(state.emotionPoints, state.stamina ?? 100);
        setExpression(svgEl, s.key, false);
      }
      voiceOptions.onEnd?.();
    },
  });

  return { spokenText, learned };
}
