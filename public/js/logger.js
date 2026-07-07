const MAX_ENTRIES = 200;
const SESSION_KEY = 'amic_logs';

let _entries = [];

try {
  const saved = sessionStorage.getItem(SESSION_KEY);
  if (saved) _entries = JSON.parse(saved);
} catch {}

function _flush() {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(_entries)); } catch {}
}

function _add(level, action, { model, message, details } = {}) {
  const entry = { ts: Date.now(), level, action, model, message, details };
  _entries.push(entry);
  if (_entries.length > MAX_ENTRIES) _entries.shift();
  _flush();
  document.dispatchEvent(new CustomEvent('amic:log', { detail: entry }));
  return entry;
}

export function logInfo(action, { model, message, details } = {}) {
  const entry = _add('info', action, { model, message, details });
  const parts = [`[Amic][${action}]`];
  if (model) parts.push(`model=${model}`);
  if (message) parts.push(message);
  console.log(parts.join(' '), ...(details ? [details] : []));
  return entry;
}

export function logWarn(action, message, { model, details } = {}) {
  const entry = _add('warn', action, { model, message, details });
  const parts = [`[Amic][${action}] AVISO:`];
  if (model) parts.push(`model=${model}`);
  parts.push(message);
  console.warn(parts.join(' '), ...(details ? [details] : []));
  return entry;
}

export function logError(action, error, { model, details } = {}) {
  const message = error?.message || String(error);
  const entry = _add('error', action, { model, message, details: details ?? error });
  const parts = [`[Amic][${action}] ERRO:`];
  if (model) parts.push(`model=${model}`);
  console.error(parts.join(' '), error, ...(details ? [details] : []));
  return entry;
}

export function getLogs() { return [..._entries].reverse(); }

export function clearLogs() {
  _entries = [];
  try { sessionStorage.removeItem(SESSION_KEY); } catch {}
  document.dispatchEvent(new CustomEvent('amic:log', { detail: null }));
}
