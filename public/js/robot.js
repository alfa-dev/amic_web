import { loadMemory, saveMemory, addFact, addConversation, ageFacts } from './memory.js';
import { applyEvent, evolvePersonality, detectIntent, trackRequest, isExcessive, getEmotionState } from './emotion.js';
import { askBip } from './ai.js';
import { detectLearnRequest } from './learn.js';
import { speak } from './voice.js';
import { setExpression, playExpression, setMovementSpeed, registerExpression, getFaceAPI } from './face.js';
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

let state = loadMemory();
let svgEl = null;
let _isSleeping = false;
let _sleepInterval = null;

// Support multiple listeners (onRobotChange can be called several times)
const _stateListeners = [];

export function getRobot() { return state; }
export function isSleeping() { return _isSleeping; }
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
  _stateListeners.forEach(cb => cb(state));
}

export function initRobot(svg, changeCb) {
  svgEl = svg;
  if (changeCb) _stateListeners.push(changeCb);

  state = loadMemory();
  state.sessionStart = Date.now();
  saveMemory(state);

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

  // Spontaneous thoughts: Amic speaks on his own every 1–6 min
  async function doSpontaneousThought() {
    const apiKey = (JSON.parse(localStorage.getItem('bip_data') || '{}')).apiKey;
    if (!apiKey) return;
    // Don't interrupt if mic is active
    if (typeof document !== 'undefined' && document.getElementById('mic-btn')?.classList.contains('listening')) return;

    // Sleeping: maybe wake up to tell a dream (only if stamina > 40, 35% chance)
    if (_isSleeping) {
      const stamina = state.stamina ?? 100;
      if (stamina < 40) return;
      if (Math.random() > 0.35) return;
      try {
        const result = await askBip(state, '[PENSAMENTO_ESPONTANEO:SONHO]', {});
        if (result?.spokenText) {
          wakeUp();
          state = addConversation(state, 'assistant', result.spokenText);
          saveMemory(state);
          notifyChange();
          document.dispatchEvent(new CustomEvent('amic:dream', {
            detail: { text: result.spokenText, expressionKey: result.expressionKey, dreamEmojis: result.dreamEmojis || [] }
          }));
        }
      } catch {}
      return;
    }

    const emotionState = getEmotionState(state.emotionPoints, state.stamina ?? 100);
    if (emotionState.key === 'EXHAUSTED') return;
    try {
      // Only share facts/feelings if there was a recent conversation (< 20 min ago)
      const lastMsg = state.conversationHistory?.slice(-1)[0];
      const recentConv = lastMsg && (Date.now() - lastMsg.ts < 20 * 60 * 1000);
      const types = recentConv ? ['SOZINHO', 'ALGUEM', 'FATO'] : ['ALGUEM'];
      const tipo = types[Math.floor(Math.random() * types.length)];
      const result = await askBip(state, `[PENSAMENTO_ESPONTANEO:${tipo}]`, {});
      if (result?.spokenText) {
        state = addConversation(state, 'assistant', result.spokenText);
        saveMemory(state);
        notifyChange();
        document.dispatchEvent(new CustomEvent('amic:spontaneous', {
          detail: { text: result.spokenText, expressionKey: result.expressionKey }
        }));
      }
    } catch {}
  }

  function scheduleNextThought() {
    const delay = (1 + Math.random() * 5) * 60 * 1000; // 1–6 min
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
      const result = await askBip(state, `[APRENDER:${learnTopic}]`, {
        onChunk: voiceOptions.onChunk,
        maxTokens: 1200,
      });
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
        if (expressionKey && expressionKey !== 'NONE') playExpression(expressionKey);
        const s = getEmotionState(state.emotionPoints, state.stamina ?? 100);
        setExpression(svgEl, s.key, true);
      }
      await speak(spokenText, {
        ...voiceOptions,
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
    response = await askBip(state, text, { onChunk: voiceOptions.onChunk });
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
    if (expressionKey && expressionKey !== 'NONE') playExpression(expressionKey);
    const s = getEmotionState(state.emotionPoints, state.stamina ?? 100);
    setExpression(svgEl, s.key, true);
  }

  await speak(spokenText, {
    ...voiceOptions,
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
