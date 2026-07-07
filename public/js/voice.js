import { logInfo, logWarn, logError } from './logger.js';

// ── Speech recognition ────────────────────────────────────────────────────────

let recognition = null;
let synthesis = window.speechSynthesis;
let currentUtterance = null;
let currentAudio = null; // ElevenLabs Audio element

export function initSpeechRecognition(lang = 'pt-BR') {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;

  recognition = new SpeechRecognition();
  recognition.lang = lang;
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  return recognition;
}

export function listen(lang = 'pt-BR') {
  return new Promise((resolve, reject) => {
    if (!recognition) initSpeechRecognition(lang);
    if (!recognition) return reject(new Error('SpeechRecognition não suportado'));

    recognition.lang = lang;
    let settled = false;

    recognition.onresult = (event) => {
      if (settled) return;
      settled = true;
      resolve(event.results[0][0].transcript);
    };

    recognition.onerror = (event) => {
      if (settled) return;
      settled = true;
      reject(new Error(event.error));
    };

    // Without this, on iOS the Promise hangs when no speech is detected
    recognition.onend = () => {
      if (!settled) {
        settled = true;
        reject(new Error('not-matched'));
      }
    };

    try {
      recognition.start();
    } catch (e) {
      recognition.stop();
      setTimeout(() => {
        try { recognition.start(); } catch {}
      }, 300);
    }
  });
}

export function stopListening() {
  if (recognition) {
    try { recognition.stop(); } catch {}
  }
}

export function listenPTT(lang = 'pt-BR') {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;
  const rec = new SpeechRecognition();
  rec.lang = lang;
  rec.continuous = true;
  rec.interimResults = true;
  let finalTranscript = '';
  let resolveStop;

  rec.onresult = (e) => {
    finalTranscript = '';
    for (const result of e.results) {
      finalTranscript += result[0].transcript;
    }
  };
  rec.onend = () => resolveStop?.(finalTranscript);

  return {
    start() { finalTranscript = ''; rec.start(); },
    stop()  { return new Promise(r => { resolveStop = r; rec.stop(); }); },
  };
}

// ── ElevenLabs TTS ────────────────────────────────────────────────────────────

const EL_API = 'https://api.elevenlabs.io/v1/text-to-speech';
// Default: "Rachel" — neutral, clear, works well with eleven_multilingual_v2
const EL_DEFAULT_VOICE = '21m00Tcm4TlvDq8ikWAM';

// Emotion → voice expressiveness parameters
// stability: lower = more variable/expressive
// style: higher = more exaggerated delivery
const EMOTION_VOICE_PARAMS = {
  EUPHORIC:  { stability: 0.20, style: 0.90 },
  EXCITED:   { stability: 0.25, style: 0.80 },
  DELIGHTED: { stability: 0.30, style: 0.70 },
  HAPPY:     { stability: 0.45, style: 0.55 },
  CURIOUS:   { stability: 0.50, style: 0.45 },
  LAUGHING:  { stability: 0.28, style: 0.75 },
  SURPRISED: { stability: 0.35, style: 0.60 },
  NEUTRAL:   { stability: 0.65, style: 0.25 },
  THINKING:  { stability: 0.70, style: 0.15 },
  CONFUSED:  { stability: 0.60, style: 0.30 },
  WORRIED:   { stability: 0.72, style: 0.30 },
  SAD:       { stability: 0.80, style: 0.10 },
  GRUMPY:    { stability: 0.55, style: 0.50 },
  BORED:     { stability: 0.82, style: 0.08 },
  TIRED:     { stability: 0.85, style: 0.05 },
  EXHAUSTED: { stability: 0.95, style: 0.00 },
};

async function _speakElevenLabs(text, { apiKey, voiceId, emotionKey, rate = 1, onStart, onEnd } = {}) {
  const vid    = voiceId || EL_DEFAULT_VOICE;
  const params = EMOTION_VOICE_PARAMS[emotionKey] || EMOTION_VOICE_PARAMS.NEUTRAL;

  logInfo('elevenlabs', { model: `eleven_multilingual_v2 / voice=${vid}`, message: `"${text.slice(0, 50)}…"` });

  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }

  const res = await fetch(`${EL_API}/${vid}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability:        params.stability,
        similarity_boost: 0.80,
        style:            params.style,
        use_speaker_boost: true,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err?.detail?.message || err?.detail || `HTTP ${res.status}`;
    const error = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    logError('elevenlabs', error, { details: err });
    throw error;
  }

  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const audio = new Audio(url);
  // ElevenLabs doesn't expose a direct rate param, but we can slightly speed up/slow via playbackRate
  audio.playbackRate = Math.max(0.5, Math.min(2.0, rate));
  currentAudio = audio;

  return new Promise((resolve) => {
    audio.onplay  = () => onStart?.();
    audio.onended = () => {
      URL.revokeObjectURL(url);
      currentAudio = null;
      onEnd?.();
      resolve();
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      currentAudio = null;
      resolve();
    };
    audio.play().catch(() => resolve());
  });
}

// ── System TTS (fallback) ─────────────────────────────────────────────────────

function _speakSystem(text, { voiceName = '', rate = 1, lang = 'pt-BR', onStart, onEnd } = {}) {
  return new Promise((resolve) => {
    if (currentUtterance) synthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = rate;

    const voices = synthesis.getVoices();
    if (voiceName) {
      const match = voices.find(v => v.name === voiceName);
      if (match) utterance.voice = match;
    } else {
      const ptVoice = voices.find(v => v.lang.startsWith('pt'));
      if (ptVoice) utterance.voice = ptVoice;
    }

    utterance.onstart = () => onStart?.();
    utterance.onend   = () => { onEnd?.(); resolve(); };
    utterance.onerror = () => resolve();

    currentUtterance = utterance;
    synthesis.speak(utterance);
  });
}

// ── Public speak() ────────────────────────────────────────────────────────────

export function speak(text, {
  voiceName = '', rate = 1, lang = 'pt-BR',
  elevenLabsApiKey = '', elevenLabsVoiceId = '',
  emotionKey = '',
  onStart, onEnd,
} = {}) {
  // Strip JSON tail if any (leaked from LLM response)
  const clean = text.replace(/\{[\s\S]*"learned"[\s\S]*\}/, '').trim();
  if (!clean) { onEnd?.(); return Promise.resolve(); }

  if (elevenLabsApiKey) {
    return _speakElevenLabs(clean, {
      apiKey:   elevenLabsApiKey,
      voiceId:  elevenLabsVoiceId || EL_DEFAULT_VOICE,
      emotionKey,
      rate,
      onStart,
      onEnd,
    }).catch((e) => {
      logWarn('elevenlabs:fallback', 'ElevenLabs falhou — usando TTS do sistema', { details: e?.message });
      return _speakSystem(clean, { voiceName, rate, lang, onStart, onEnd });
    });
  }

  return _speakSystem(clean, { voiceName, rate, lang, onStart, onEnd });
}

export function getAvailableVoices() {
  return new Promise((resolve) => {
    let voices = synthesis.getVoices();
    if (voices.length) return resolve(voices);
    synthesis.addEventListener('voiceschanged', () => {
      resolve(synthesis.getVoices());
    }, { once: true });
  });
}

export function cancelSpeech() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  synthesis.cancel();
  currentUtterance = null;
}
