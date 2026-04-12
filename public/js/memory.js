const STORAGE_KEY = 'bip_data';

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
  voiceName: '',
  voiceRate: 1,
  voiceLang: 'pt-BR',
  showDebug: false,
};

export function loadMemory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE, birthDate: new Date().toISOString() };

    const saved = JSON.parse(raw);

    // migrate old flat learnedFacts → short_term
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
      memory: { ...DEFAULT_STATE.memory, ...(saved.memory || {}) },
      skills: { ...DEFAULT_SKILLS, ...(saved.skills || {}) },
      weaknesses: { ...DEFAULT_WEAKNESSES, ...(saved.weaknesses || {}) },
    };
  } catch {
    return { ...DEFAULT_STATE, birthDate: new Date().toISOString() };
  }
}

export function saveMemory(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function resetMemory() {
  const current = loadMemory();
  const fresh = {
    ...DEFAULT_STATE,
    birthDate: new Date().toISOString(),
    name: current.name,
    apiKey: current.apiKey,
    voiceName: current.voiceName,
    voiceRate: current.voiceRate,
    voiceLang: current.voiceLang,
    showDebug: current.showDebug,
  };
  saveMemory(fresh);
  return fresh;
}

// Add a new fact to short_term. If already exists, reinforce it.
export function addFact(state, content, importance = 1) {
  const mem = state.memory;
  const all = [...mem.short_term, ...mem.medium_term, ...mem.long_term];
  const existing = all.find(f => f.content === content);
  if (existing) {
    return reinforceFact(state, content);
  }
  mem.short_term = [...mem.short_term, { content, importance, last_used: 0 }];
  return state;
}

// Increase importance of a known fact; may promote it to a higher tier.
export function reinforceFact(state, content) {
  const mem = state.memory;
  for (const tier of ['short_term', 'medium_term', 'long_term']) {
    const idx = mem[tier].findIndex(f => f.content === content);
    if (idx !== -1) {
      mem[tier][idx].importance = Math.min(4, mem[tier][idx].importance + 1);
      mem[tier][idx].last_used = 0;
      break;
    }
  }
  promoteFacts(state);
  return state;
}

function promoteFacts(state) {
  const mem = state.memory;

  // short_term → medium_term when importance >= 3
  const toMedium = mem.short_term.filter(f => f.importance >= 3);
  mem.short_term = mem.short_term.filter(f => f.importance < 3);
  mem.medium_term = [...mem.medium_term, ...toMedium];

  // medium_term → long_term when importance >= 4
  const toLong = mem.medium_term.filter(f => f.importance >= 4);
  mem.medium_term = mem.medium_term.filter(f => f.importance < 4);
  mem.long_term = [...mem.long_term, ...toLong].slice(-80);

  mem.medium_term = mem.medium_term.slice(-40);
  mem.short_term = mem.short_term.slice(-30);
}

// Called after each turn: age all facts, forget stale low-importance ones.
export function ageFacts(state) {
  const mem = state.memory;

  const age = facts => facts.map(f => ({ ...f, last_used: f.last_used + 1 }));
  mem.short_term = age(mem.short_term).filter(f => !(f.importance <= 1 && f.last_used > 15));
  mem.medium_term = age(mem.medium_term).filter(f => !(f.importance <= 2 && f.last_used > 40));
  // long_term never forgotten

  return state;
}

// Returns all facts formatted for the system prompt.
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
    { role, content, ts: Date.now() }
  ].slice(-50);
  return state;
}
