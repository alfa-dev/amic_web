const DEFAULT_SKILLS = {
  communication: 1,
  creativity: 1,
  problem_solving: 1,
  curiosity: 3,
  empathy: 2,
};

const DEFAULT_WEAKNESSES = {
  laziness: 7,
  ignorance: 9,
  indecision: 6,
  stubbornness: 5,
};

const DEFAULT_STATE = {
  name: 'Amic',
  birthDate: new Date().toISOString(),
  emotionPoints: 50,
  stamina: 100,
  memory: { short_term: [], medium_term: [], long_term: [] },
  skills: { ...DEFAULT_SKILLS },
  weaknesses: { ...DEFAULT_WEAKNESSES },
  conversationHistory: [],
  totalTalkMinutes: 0,
  sessionStart: null,
  apiKey: '',
  groqApiKey: '',
  voiceName: '',
  voiceRate: 1,
  voiceLang: 'pt-BR',
  elevenLabsApiKey: '',
  elevenLabsVoiceId: '',
  usePiperTts: false,
  piperVoice: 'pt_BR-faber-medium',
  skinId: 'classic',
  showDebug: false,
};

// ── In-memory cache (source of truth during the session) ─────────────────────
let _cache = null;
let _syncTimer = null;

function _csrfToken() {
  return document.querySelector('meta[name="csrf-token"]')?.content || '';
}

function _mergeDefaults(saved) {
  // Migrate old flat learnedFacts → short_term
  if (saved.learnedFacts && !saved.memory) {
    saved.memory = {
      short_term: saved.learnedFacts.map(content => ({ content, importance: 2, last_used: 5 })),
      medium_term: [],
      long_term: [],
    };
    delete saved.learnedFacts;
  }
  return {
    ...DEFAULT_STATE,
    ...saved,
    memory:     { ...DEFAULT_STATE.memory,     ...(saved.memory     || {}) },
    skills:     { ...DEFAULT_SKILLS,           ...(saved.skills     || {}) },
    weaknesses: { ...DEFAULT_WEAKNESSES,       ...(saved.weaknesses || {}) },
  };
}

async function _flushNow(state) {
  try {
    await fetch('/api/amic_state', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': _csrfToken() },
      body: JSON.stringify({ state_data: state }),
      keepalive: true,
    });
  } catch {}
}

function _scheduleSave() {
  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(() => _flushNow(_cache), 1500);
}

window.addEventListener('beforeunload', () => {
  if (_cache) { clearTimeout(_syncTimer); _flushNow(_cache); }
});

// ── Public API ────────────────────────────────────────────────────────────────

// Await this once before anything calls loadMemory().
// Returns { state, codeLibrary } so both are initialized in one request.
export async function initMemory() {
  try {
    const res = await fetch('/api/amic_state', { credentials: 'same-origin' });
    if (res.ok) {
      const { state_data, code_library } = await res.json();

      // First time for this user — migrate from localStorage if data is there
      if (!state_data) {
        const localRaw  = localStorage.getItem('bip_data');
        const localCode = localStorage.getItem('amic_code_library');
        const migratedState = localRaw  ? (() => { try { return JSON.parse(localRaw);  } catch { return null; } })() : null;
        const migratedLib   = localCode ? (() => { try { return JSON.parse(localCode); } catch { return null; } })() : null;

        _cache = _mergeDefaults(migratedState || {});
        if (!migratedState) _cache.birthDate = new Date().toISOString();

        await _flushNow(_cache);
        if (migratedLib) {
          await fetch('/api/amic_state', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': _csrfToken() },
            body: JSON.stringify({ code_library: migratedLib }),
            keepalive: true,
          });
        }
        localStorage.removeItem('bip_data');
        localStorage.removeItem('amic_code_library');
        return { state: _cache, codeLibrary: migratedLib };
      }

      _cache = _mergeDefaults(state_data);
      return { state: _cache, codeLibrary: code_library };
    }
  } catch {}

  // Fallback: fresh state (server unreachable)
  _cache = { ...DEFAULT_STATE, birthDate: new Date().toISOString() };
  return { state: _cache, codeLibrary: null };
}

export function loadMemory() {
  if (!_cache) _cache = { ...DEFAULT_STATE, birthDate: new Date().toISOString() };
  return _cache;
}

export function saveMemory(state) {
  _cache = state;
  _scheduleSave();
}

export function resetMemory() {
  const current = _cache || loadMemory();
  const fresh = {
    ...DEFAULT_STATE,
    birthDate:         new Date().toISOString(),
    name:              current.name,
    apiKey:            current.apiKey,
    groqApiKey:        current.groqApiKey,
    voiceName:         current.voiceName,
    voiceRate:         current.voiceRate,
    voiceLang:         current.voiceLang,
    elevenLabsApiKey:  current.elevenLabsApiKey,
    elevenLabsVoiceId: current.elevenLabsVoiceId,
    usePiperTts:       current.usePiperTts,
    piperVoice:        current.piperVoice,
    skinId:            current.skinId,
    showDebug:         current.showDebug,
  };
  _cache = fresh;
  _flushNow(fresh);
  return fresh;
}

// ── Facts ─────────────────────────────────────────────────────────────────────

export function addFact(state, content, importance = 1) {
  const mem = state.memory;
  const all = [...mem.short_term, ...mem.medium_term, ...mem.long_term];
  if (all.find(f => f.content === content)) return reinforceFact(state, content);
  mem.short_term = [...mem.short_term, { content, importance, last_used: 0 }];
  return state;
}

export function reinforceFact(state, content) {
  const mem = state.memory;
  for (const tier of ['short_term', 'medium_term', 'long_term']) {
    const idx = mem[tier].findIndex(f => f.content === content);
    if (idx !== -1) {
      mem[tier][idx].importance = Math.min(4, mem[tier][idx].importance + 1);
      mem[tier][idx].last_used  = 0;
      break;
    }
  }
  _promoteFacts(state);
  return state;
}

function _promoteFacts(state) {
  const mem = state.memory;
  const toMedium = mem.short_term.filter(f => f.importance >= 3);
  mem.short_term  = mem.short_term.filter(f => f.importance < 3);
  mem.medium_term = [...mem.medium_term, ...toMedium];
  const toLong = mem.medium_term.filter(f => f.importance >= 4);
  mem.medium_term = mem.medium_term.filter(f => f.importance < 4);
  mem.long_term   = [...mem.long_term, ...toLong].slice(-80);
  mem.medium_term = mem.medium_term.slice(-40);
  mem.short_term  = mem.short_term.slice(-30);
}

export function ageFacts(state) {
  const mem = state.memory;
  const age = facts => facts.map(f => ({ ...f, last_used: f.last_used + 1 }));
  mem.short_term  = age(mem.short_term).filter(f => !(f.importance <= 1 && f.last_used > 15));
  mem.medium_term = age(mem.medium_term).filter(f => !(f.importance <= 2 && f.last_used > 40));
  return state;
}

export function getAllFacts(state) {
  const mem = state.memory;
  if (!mem.long_term.length && !mem.medium_term.length && !mem.short_term.length) {
    return 'ainda não aprendi nada';
  }
  const lines = [];
  if (mem.long_term.length) {
    lines.push('Memórias permanentes (nunca esqueço):');
    mem.long_term.forEach(f => lines.push(`  - ${f.content}`));
  }
  if (mem.medium_term.length) {
    lines.push('Memórias consolidadas (lembro bem):');
    mem.medium_term.forEach(f => lines.push(`  - ${f.content}`));
  }
  if (mem.short_term.length) {
    lines.push('Memórias recentes (lembro vagamente):');
    mem.short_term.forEach(f => lines.push(`  - ${f.content}`));
  }
  return lines.join('\n');
}

export function addConversation(state, role, content) {
  state.conversationHistory = [
    ...state.conversationHistory,
    { role, content, ts: Date.now() },
  ].slice(-50);
  return state;
}
