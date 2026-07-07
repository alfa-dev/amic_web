// sandbox.js — Runtime code execution: robot learns and composes new behaviors

let codeLibrary = {
  version:     1,
  expressions: {},
  actions:     {},
  behaviors:   {},
};

let _registerExpression = null;
let _getFaceAPI         = null;
let _playExpressionFn   = null;
let _registeredActions  = {};
let _saveTimer          = null;

function _csrfToken() {
  return document.querySelector('meta[name="csrf-token"]')?.content || '';
}

function _scheduleSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    fetch('/api/amic_state', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': _csrfToken() },
      body:    JSON.stringify({ code_library: codeLibrary }),
      keepalive: true,
    }).catch(() => {});
  }, 1500);
}

window.addEventListener('beforeunload', () => {
  if (_saveTimer) {
    clearTimeout(_saveTimer);
    fetch('/api/amic_state', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': _csrfToken() },
      body:    JSON.stringify({ code_library: codeLibrary }),
      keepalive: true,
    }).catch(() => {});
  }
});

// Called from index.html.erb BEFORE initSandbox, with data from initMemory()
export function preloadCodeLibrary(data) {
  if (!data) return;
  codeLibrary = {
    version:     data.version     || 1,
    expressions: data.expressions || {},
    actions:     data.actions     || {},
    behaviors:   data.behaviors   || {},
  };
}

// initSandbox({ registerExpression, getFaceAPI, playExpression })
export function initSandbox(fns = {}) {
  _registerExpression = fns.registerExpression || null;
  _getFaceAPI         = fns.getFaceAPI         || null;
  _playExpressionFn   = fns.playExpression     || null;
  return replayAll();
}

// ── Sandbox API ───────────────────────────────────────────────────────────────
function createAPI() {
  return {
    face: _getFaceAPI?.() || {},

    addExpression(name, params) {
      const key = String(name).toUpperCase().replace(/[^A-Z_]/g, '_');
      if (!key) return;
      const clean = {
        eyeScY:  clamp(num(params.eyeScY,  0.88), 0,     1.30),
        eyeRotZ: clamp(num(params.eyeRotZ, 0),   -0.40,  0.40),
        browLZ:  clamp(num(params.browLZ,  0),   -0.50,  0.50),
        browRZ:  clamp(num(params.browRZ,  0),   -0.50,  0.50),
        browY:   clamp(num(params.browY,   0),   -0.10,  0.25),
        mouthC:  clamp(num(params.mouthC,  0.08),-0.80,  0.80),
        headRX:  clamp(num(params.headRX,  0),   -0.25,  0.25),
        headRZ:  clamp(num(params.headRZ,  0),   -0.18,  0.18),
      };
      codeLibrary.expressions[key] = { params: clean, ts: Date.now() };
      _registerExpression?.(key, clean);
      _scheduleSave();
      console.info(`[Amic sandbox] Expressão registrada: ${key}`);
    },

    playExpression(name) {
      _playExpressionFn?.(String(name).toUpperCase());
    },

    defineAction(name, description, code) {
      const key = String(name).toUpperCase().replace(/[^A-Z_]/g, '_');
      if (!key || typeof code !== 'string') return;
      codeLibrary.actions[key] = { code: code.trim(), description: String(description), ts: Date.now() };
      _registeredActions[key]  = _makeRunner(code.trim());
      _scheduleSave();
      console.info(`[Amic sandbox] Ação definida: ${key}`);
    },

    do(name) {
      const key = String(name).toUpperCase().replace(/[^A-Z_]/g, '_');
      const fn  = _registeredActions[key];
      if (fn) fn();
      else console.warn(`[Amic sandbox] Ação desconhecida: ${key}`);
    },

    after(ms, fn)  { return setTimeout(fn, Number(ms)); },
    every(ms, fn)  { return setInterval(fn, Number(ms)); },
    stop(id)       { clearInterval(id); clearTimeout(id); },
  };
}

function _makeRunner(code) {
  return () => {
    try {
      new Function('api', `"use strict";\n${code}`)(createAPI());
    } catch (e) {
      console.warn('[Amic sandbox] Erro ao executar action:', e.message);
    }
  };
}

function num(v, fallback)  { return typeof v === 'number' && isFinite(v) ? v : fallback; }
function clamp(v, lo, hi)  { return Math.max(lo, Math.min(hi, v)); }

export function executeSandboxCode(code, behaviorId) {
  if (!code?.trim()) return { success: false, error: 'empty code' };
  try {
    new Function('api', `"use strict";\n${code}`)(createAPI());

    if (behaviorId) {
      codeLibrary.behaviors[behaviorId] = { code, ts: Date.now() };
      _scheduleSave();
    }

    document.dispatchEvent(new CustomEvent('amic:code-executed', { detail: { behaviorId, code } }));
    return { success: true };
  } catch (e) {
    console.warn('[Amic sandbox] Erro:', e.message);
    return { success: false, error: e.message };
  }
}

export function replayAll() {
  let n = 0;
  for (const [key, { params }] of Object.entries(codeLibrary.expressions || {})) {
    _registerExpression?.(key, params);
    n++;
  }
  for (const [key, { code }] of Object.entries(codeLibrary.actions || {})) {
    _registeredActions[key] = _makeRunner(code);
    n++;
  }
  return n;
}

export function getCodeLibrary()  { return codeLibrary; }

export function resetCodeLibrary() {
  codeLibrary        = { version: 1, expressions: {}, actions: {}, behaviors: {} };
  _registeredActions = {};
  clearTimeout(_saveTimer);
  fetch('/api/amic_state', {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': _csrfToken() },
    body:    JSON.stringify({ code_library: codeLibrary }),
    keepalive: true,
  }).catch(() => {});
}
