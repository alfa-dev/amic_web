import { initFace, setExpression } from './face.js';
import { initRobot, handleUserMessage, getRobot, onRobotChange } from './robot.js';
import { listen, stopListening, initSpeechRecognition } from './voice.js';
import { loadMemory } from './memory.js';
import { getEmotionState } from './emotion.js';

const svgEl = document.getElementById('bip-face');
const micBtn = document.getElementById('mic-btn');
const statusLabel = document.getElementById('status-label');
const emotionLabel = document.getElementById('emotion-label');
const pointsLabel = document.getElementById('points-label');
const transcriptEl = document.getElementById('transcript');
const responseEl = document.getElementById('response');

function getVoiceOptions() {
  const mem = loadMemory();
  return {
    voiceName: mem.voiceName || '',
    rate: parseFloat(mem.voiceRate) || 1,
    lang: mem.voiceLang || 'pt-BR',
  };
}

function updateUI(robot) {
  const state = getEmotionState(robot.emotionPoints);
  emotionLabel.textContent = state.name;
  emotionLabel.className = `emotion-label emotion-${state.key.toLowerCase()}`;

  const mem = loadMemory();
  if (mem.showDebug) {
    const ltCount = robot.memory?.long_term?.length ?? 0;
    const mtCount = robot.memory?.medium_term?.length ?? 0;
    const stCount = robot.memory?.short_term?.length ?? 0;
    pointsLabel.textContent = `emoção: ${robot.emotionPoints} | stamina: ${robot.stamina ?? 100} | mem: ${ltCount}L ${mtCount}M ${stCount}S`;
    pointsLabel.style.display = 'block';
  } else {
    pointsLabel.style.display = 'none';
  }
}

let listening = false;

micBtn.addEventListener('click', async () => {
  if (listening) return;
  listening = true;

  // read apiKey fresh from localStorage (may have been saved after page load)
  const stored = JSON.parse(localStorage.getItem('bip_data') || '{}');
  if (!stored.apiKey) {
    statusLabel.textContent = 'Configure a chave da API primeiro (⚙)';
    setTimeout(() => (statusLabel.textContent = ''), 3000);
    listening = false;
    return;
  }

  micBtn.classList.add('listening');
  statusLabel.textContent = 'Ouvindo...';
  transcriptEl.textContent = '';
  responseEl.textContent = '';

  const mem = loadMemory();
  let text;
  try {
    text = await listen(mem.voiceLang || 'pt-BR');
  } catch (e) {
    statusLabel.textContent = 'Não consegui ouvir. Tente de novo.';
    micBtn.classList.remove('listening');
    setTimeout(() => (statusLabel.textContent = ''), 3000);
    listening = false;
    return;
  }

  micBtn.classList.remove('listening');
  statusLabel.textContent = 'Pensando...';
  transcriptEl.textContent = `Você: ${text}`;

  const result = await handleUserMessage(text, getVoiceOptions());

  if (result?.spokenText) {
    responseEl.textContent = `Amic: ${result.spokenText}`;
  } else if (result?.error) {
    responseEl.textContent = result.error;
  }

  statusLabel.textContent = '';
  listening = false;
});

// init
initFace(svgEl);
initRobot(svgEl, updateUI);
updateUI(getRobot());

// set robot name in title
const robot = getRobot();
document.title = robot.name || 'Amic';
const nameEl = document.getElementById('robot-name');
if (nameEl) nameEl.textContent = robot.name || 'Amic';
