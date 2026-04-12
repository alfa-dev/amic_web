let recognition = null;
let synthesis = window.speechSynthesis;
let currentUtterance = null;

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

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      resolve(transcript);
    };

    recognition.onerror = (event) => {
      reject(new Error(event.error));
    };

    recognition.onend = () => {};

    try {
      recognition.start();
    } catch (e) {
      recognition.stop();
      setTimeout(() => {
        recognition.start();
      }, 300);
    }
  });
}

export function stopListening() {
  if (recognition) {
    try { recognition.stop(); } catch {}
  }
}

export function speak(text, { voiceName = '', rate = 1, lang = 'pt-BR', onStart, onEnd } = {}) {
  return new Promise((resolve) => {
    if (currentUtterance) {
      synthesis.cancel();
    }

    // strip JSON tail if any
    const clean = text.replace(/\{[\s\S]*"learned"[\s\S]*\}/, '').trim();

    const utterance = new SpeechSynthesisUtterance(clean);
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
    utterance.onend = () => {
      onEnd?.();
      resolve();
    };
    utterance.onerror = () => resolve();

    currentUtterance = utterance;
    synthesis.speak(utterance);
  });
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
  synthesis.cancel();
  currentUtterance = null;
}
