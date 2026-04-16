// sandbox.js — Runtime code execution: robot learns and composes new behaviors
// The robot writes JS from low-level primitives (api.face.*, api.after, etc.)
// No behaviors are hardcoded here — the robot invents them.

const STORAGE_KEY = 'amic_code_library';

let codeLibrary = {
  version:     1,
  expressions: {},  // { NAME: { params, ts } }           — replayed on load (registration)
  actions:     {},  // { NAME: { code, description, ts } } — registered on load, NOT auto-run
  behaviors:   {},  // legacy one-shot blocks               — NOT replayed
};

// Injected from face.js via initSandbox
let _registerExpression = null;
let _getFaceAPI         = null;
let _playExpressionFn   = null;

// Named actions registered for this session (key → fn)
let _registeredActions = {};

// initSandbox({ registerExpression, getFaceAPI, playExpression })
export function initSandbox(fns = {}) {
  _registerExpression = fns.registerExpression  || null;
  _getFaceAPI         = fns.getFaceAPI          || null;
  _playExpressionFn   = fns.playExpression      || null;
  _load();
  return replayAll();
}

// ── Persistence ───────────────────────────────────────────────────────────────
function _load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      codeLibrary = { ...codeLibrary, ...parsed };
      // ensure actions key exists for old stored data
      codeLibrary.actions = codeLibrary.actions || {};
    }
  } catch {}
}

function _save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(codeLibrary));
}

// ── Sandbox API ───────────────────────────────────────────────────────────────
// This is the `api` object available inside every [CODE] block.
// It exposes low-level face controls and timing — no pre-built behaviors.
function createAPI() {
  return {
    // Low-level face control — all methods composed by the robot
    face: _getFaceAPI?.() || {},

    // ── Expressions ──────────────────────────────────────────────────────────
    // Register a permanent named expression (replayed on startup)
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
      _save();
      console.info(`[Amic sandbox] Expressão registrada: ${key}`);
    },

    // Play a named expression temporarily (2–5 s)
    playExpression(name) {
      _playExpressionFn?.(String(name).toUpperCase());
    },

    // ── Named actions ─────────────────────────────────────────────────────────
    // Define a reusable named action — stored permanently, callable with api.do()
    // name: identifier (e.g. 'WINK')
    // description: human-readable (shown in debug panel + AI prompt)
    // code: JS string run inside a new Function('api', code) when triggered
    defineAction(name, description, code) {
      const key = String(name).toUpperCase().replace(/[^A-Z_]/g, '_');
      if (!key || typeof code !== 'string') return;
      codeLibrary.actions[key] = { code: code.trim(), description: String(description), ts: Date.now() };
      // Register for immediate use in this session
      _registeredActions[key] = _makeRunner(code.trim());
      _save();
      console.info(`[Amic sandbox] Ação definida: ${key}`);
    },

    // Execute a previously defined named action
    do(name) {
      const key = String(name).toUpperCase().replace(/[^A-Z_]/g, '_');
      const fn = _registeredActions[key];
      if (fn) fn();
      else console.warn(`[Amic sandbox] Ação desconhecida: ${key}`);
    },

    // ── Timing ────────────────────────────────────────────────────────────────
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

// ── Execute a code block (from [CODE]...[/CODE] in AI response) ───────────────
export function executeSandboxCode(code, behaviorId) {
  if (!code?.trim()) return { success: false, error: 'empty code' };
  try {
    new Function('api', `"use strict";\n${code}`)(createAPI());

    // Store as legacy behavior (for history/debug), but will NOT be replayed
    if (behaviorId) {
      codeLibrary.behaviors[behaviorId] = { code, ts: Date.now() };
      _save();
    }

    document.dispatchEvent(new CustomEvent('amic:code-executed', {
      detail: { behaviorId, code }
    }));
    return { success: true };
  } catch (e) {
    console.warn('[Amic sandbox] Erro:', e.message);
    return { success: false, error: e.message };
  }
}

// ── Replay on startup ─────────────────────────────────────────────────────────
// Only re-registers definitions — does NOT run behaviors or actions.
export function replayAll() {
  let n = 0;

  // 1. Re-register permanent expressions
  for (const [key, { params }] of Object.entries(codeLibrary.expressions || {})) {
    _registerExpression?.(key, params);
    n++;
  }

  // 2. Re-register named action functions (available to call, but not auto-run)
  for (const [key, { code }] of Object.entries(codeLibrary.actions || {})) {
    _registeredActions[key] = _makeRunner(code);
    n++;
  }

  // Behaviors are intentionally NOT replayed (one-shot side effects)

  return n;
}

export function getCodeLibrary()  { return codeLibrary; }

export function resetCodeLibrary() {
  codeLibrary = { version: 1, expressions: {}, actions: {}, behaviors: {} };
  _registeredActions = {};
  localStorage.removeItem(STORAGE_KEY);
}
