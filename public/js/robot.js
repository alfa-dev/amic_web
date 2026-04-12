import { loadMemory, saveMemory, addFact, addConversation, ageFacts } from './memory.js';
import { applyEvent, evolvePersonality, detectIntent, trackRequest, isExcessive, getEmotionState } from './emotion.js';
import { askBip } from './ai.js';
import { speak } from './voice.js';
import { setExpression } from './face.js';
import { startBatteryMonitoring } from './battery.js';
import { getCoords, startWeatherMonitoring } from './weather.js';

let state = loadMemory();
let svgEl = null;
let onStateChange = null;

export function getRobot() { return state; }
export function setRobot(newState) {
  state = newState;
  saveMemory(state);
  notifyChange();
}

export function onRobotChange(cb) {
  onStateChange = cb;
}

function notifyChange() {
  if (svgEl) {
    const s = getEmotionState(state.emotionPoints);
    setExpression(svgEl, s.key);
  }
  onStateChange?.(state);
}

export function initRobot(svg, changeCb) {
  svgEl = svg;
  onStateChange = changeCb;

  state = loadMemory();
  state.sessionStart = Date.now();
  saveMemory(state);
  notifyChange();

  // session fatigue: -emotion and -stamina after 1h continuous
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

  // stamina recovery during idle (every 30 min)
  setInterval(() => {
    const last = state.conversationHistory?.slice(-1)[0];
    const idleSince = last ? Date.now() - last.ts : Infinity;

    if (idleSince > 30 * 60 * 1000 && (state.stamina ?? 100) < 100) {
      state = applyEvent(state, 'stamina_recover');
      notifyChange();
    }
  }, 30 * 60 * 1000);

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

  startBatteryMonitoring(getRobot, setRobot);

  getCoords()
    .then(coords => startWeatherMonitoring(getRobot, setRobot, coords))
    .catch(() => console.info('Geolocalização não disponível'));
}

export async function handleUserMessage(text, voiceOptions = {}) {
  if (!text?.trim()) return;

  const intent = detectIntent(text);
  trackRequest(intent);

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
    const s = getEmotionState(state.emotionPoints);
    setExpression(svgEl, s.key, false);
  }

  let response;
  try {
    // askBip already appends userMessage to the history internally — don't add it before
    response = await askBip(state, text);
  } catch (e) {
    const errMsg = e.message || 'Algo deu errado...';
    await speak(errMsg, voiceOptions);
    return { error: errMsg };
  }

  const { spokenText, learned } = response;

  // add learned facts to tiered memory
  for (const fact of learned) {
    state = addFact(state, fact, 1);
  }

  // evolve personality with learned facts count
  state = evolvePersonality(state, 'pleasant_talk', learned.length);

  // age all facts after this turn
  state = ageFacts(state);

  // add both messages to history AFTER response (user msg must not be in history when askBip runs)
  state = addConversation(state, 'user', text);
  state = addConversation(state, 'assistant', spokenText);
  state = applyEvent(state, 'pleasant_talk');
  saveMemory(state);
  notifyChange();

  if (svgEl) {
    const s = getEmotionState(state.emotionPoints);
    setExpression(svgEl, s.key, true);
  }

  await speak(spokenText, {
    ...voiceOptions,
    onEnd: () => {
      if (svgEl) {
        const s = getEmotionState(state.emotionPoints);
        setExpression(svgEl, s.key, false);
      }
    },
  });

  return { spokenText, learned };
}
