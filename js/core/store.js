// Central data-access layer. Every view reads from getState() and changes data
// only through update(), so tasks have one source of truth across Dashboard,
// My Tasks, Calendar and Kanban.
import { deepClone } from './utils.js';
import { defaultState, migrateV1, normalizeState } from './model.js';

export const STORAGE_KEY = 'taskzen:v2';
export const BACKUP_KEY = 'taskzen:v2:backup';
const V1_TASKS_KEY = 'tasks';
const V1_CATEGORIES_KEY = 'categories';

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

let storage = null;
let state = null;
let listeners = new Set();
let lastUndo = null; // { label, snapshot }
let saveError = null;
let middleware = []; // [{ before(state) → token, after(state, token) → events[] }]

/** Run logic (rewards, achievements) inside every update, before it is saved. */
export function addMiddleware(m) {
  middleware.push(m);
}

function safeParse(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

/**
 * Load state from storage. Order of preference:
 * 1. TaskZen 2.0 data  2. TaskZen 1.x data (migrated)  3. a fresh state.
 */
export function initStore({ storage: s, now = Date.now() } = {}) {
  storage = s || (typeof localStorage !== 'undefined' ? localStorage : memoryStorage());
  listeners = new Set();
  middleware = [];
  lastUndo = null;
  const saved = safeParse(storage.getItem(STORAGE_KEY));
  if (saved) {
    state = normalizeState(saved, now);
  } else {
    const v1Tasks = safeParse(storage.getItem(V1_TASKS_KEY));
    const v1Cats = safeParse(storage.getItem(V1_CATEGORIES_KEY));
    state = v1Tasks || v1Cats ? migrateV1(v1Tasks, v1Cats, now) : defaultState(now);
    persist();
  }
  return state;
}

export const getState = () => state;
export const getSaveError = () => saveError;

function persist() {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    saveError = null;
  } catch (e) {
    saveError = e; // usually a full quota; surfaced in Settings
  }
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(info) {
  listeners.forEach((fn) => fn(state, info));
}

/**
 * Mutate state. Options:
 *  - undo: a label; takes a snapshot so the change can be reverted
 *  - silent: persist without re-rendering (typing in notes, background bookkeeping)
 */
export function update(mutator, { undo, silent = false } = {}) {
  const snapshot = undo ? deepClone(state) : null;
  const tokens = middleware.map((m) => m.before?.(state));
  const result = mutator(state);
  const events = [];
  middleware.forEach((m, i) => events.push(...(m.after?.(state, tokens[i]) || [])));
  state.meta.updatedAt = Date.now();
  if (undo) lastUndo = { label: undo, snapshot };
  else if (!silent) lastUndo = null;
  persist();
  if (!silent || events.length) emit({ undo, events });
  return result;
}

export const canUndo = () => !!lastUndo;
export const undoLabel = () => lastUndo?.label;

/** Revert the most recent undoable change, keeping notes/settings typed since. */
export function undo() {
  if (!lastUndo) return false;
  const keep = {
    notified: state.notified,
    notes: state.notes,
    settings: state.settings,
    profile: state.profile,
  };
  state = { ...lastUndo.snapshot, ...keep };
  lastUndo = null;
  persist();
  emit({ undone: true });
  return true;
}

export function exportData() {
  return JSON.stringify({ app: 'TaskZen', exportedAt: new Date().toISOString(), data: state }, null, 2);
}

/**
 * Replace all data with an export file. The current data is copied to a
 * backup key first so an import can always be rolled back.
 */
export function importData(text) {
  const parsed = safeParse(text);
  const data = parsed?.data && parsed.app === 'TaskZen' ? parsed.data : parsed;
  if (!data || typeof data !== 'object' || !Array.isArray(data.tasks)) {
    throw new Error('That file does not look like a TaskZen backup.');
  }
  storage.setItem(BACKUP_KEY, JSON.stringify({ savedAt: Date.now(), data: state }));
  state = normalizeState(data);
  lastUndo = null;
  persist();
  emit({ imported: true });
}

export function hasBackup() {
  return !!safeParse(storage.getItem(BACKUP_KEY));
}

export function restoreBackup() {
  const b = safeParse(storage.getItem(BACKUP_KEY));
  if (!b?.data) return false;
  const current = state;
  state = normalizeState(b.data);
  storage.setItem(BACKUP_KEY, JSON.stringify({ savedAt: Date.now(), data: current }));
  persist();
  emit({ imported: true });
  return true;
}

export function resetAll() {
  storage.setItem(BACKUP_KEY, JSON.stringify({ savedAt: Date.now(), data: state }));
  state = defaultState();
  lastUndo = null;
  persist();
  emit({ reset: true });
}
