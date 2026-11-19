// Pomodoro engine. Uses an absolute end time so it stays accurate when the tab
// is in the background and survives page refreshes and navigation.
import { getState, update } from './store.js';
import { award, XP } from './gamification.js';
import { uid } from './utils.js';

const TIMER_KEY = 'taskzen:timer';
export const MODE_LABEL = { work: 'Focus', short: 'Short break', long: 'Long break' };

const listeners = new Set();
const completeListeners = new Set();
let interval = null;
let timer = null;

function minutesFor(mode) {
  const f = getState().settings.focus;
  return { work: f.work, short: f.short, long: f.long }[mode];
}

function fresh(mode = 'work', cycle = 0, taskId = null) {
  const totalMs = minutesFor(mode) * 60000;
  return { mode, running: false, endAt: null, remainingMs: totalMs, totalMs, taskId, startedAt: null, cycle, sessionId: null };
}

function save() {
  try {
    localStorage.setItem(TIMER_KEY, JSON.stringify(timer));
  } catch {
    /* storage unavailable: timer still works for this page */
  }
}

function emit() {
  listeners.forEach((fn) => fn(getTimer()));
}

export function initFocus() {
  try {
    timer = JSON.parse(localStorage.getItem(TIMER_KEY)) || null;
  } catch {
    timer = null;
  }
  if (!timer || !timer.mode) timer = fresh();
  if (timer.running) {
    if (Date.now() >= timer.endAt) complete();
    else tickLoop();
  }
}

export function getTimer() {
  const remainingMs = timer.running ? Math.max(0, timer.endAt - Date.now()) : timer.remainingMs;
  return { ...timer, remainingMs };
}

export const onTimer = (fn) => (listeners.add(fn), () => listeners.delete(fn));
export const onComplete = (fn) => (completeListeners.add(fn), () => completeListeners.delete(fn));

function tickLoop() {
  clearInterval(interval);
  interval = setInterval(() => {
    if (!timer.running) return;
    if (Date.now() >= timer.endAt) complete();
    else emit();
  }, 250);
}

export function start() {
  if (timer.running) return;
  if (!timer.startedAt) {
    timer.startedAt = Date.now();
    timer.sessionId = uid('focus');
  }
  timer.running = true;
  timer.endAt = Date.now() + timer.remainingMs;
  save();
  tickLoop();
  emit();
}

export function pause() {
  if (!timer.running) return;
  timer.remainingMs = Math.max(0, timer.endAt - Date.now());
  timer.running = false;
  timer.endAt = null;
  clearInterval(interval);
  save();
  emit();
}

const elapsedMs = () => getTimer().totalMs - getTimer().remainingMs;

/** Stop the current session. A work session of 1+ minute is logged as partial (no XP). */
export function reset() {
  if (timer.mode === 'work' && timer.startedAt && elapsedMs() >= 60000) {
    recordSession(false, Math.floor(elapsedMs() / 60000));
  }
  clearInterval(interval);
  timer = fresh(timer.mode, timer.cycle, timer.taskId);
  save();
  emit();
}

export function setMode(mode) {
  if (timer.mode === mode && !timer.startedAt) return;
  reset();
  timer = fresh(mode, timer.cycle, timer.taskId);
  save();
  emit();
}

export function setTask(taskId) {
  timer.taskId = taskId || null;
  save();
  emit();
}

/** Re-read durations after settings change (only if the timer hasn't started). */
export function refreshDurations() {
  if (!timer.startedAt) {
    timer = fresh(timer.mode, timer.cycle, timer.taskId);
    save();
    emit();
  }
}

/** Jump to the next phase without logging (skip a break, or abandon focus). */
export function skip() {
  const next = nextMode();
  reset();
  timer = fresh(next.mode, next.cycle, timer.taskId);
  save();
  emit();
}

function nextMode() {
  const every = getState().settings.focus.longEvery;
  if (timer.mode === 'work') {
    const cycle = timer.cycle + 1;
    return { mode: cycle % every === 0 ? 'long' : 'short', cycle };
  }
  return { mode: 'work', cycle: timer.mode === 'long' ? 0 : timer.cycle };
}

function recordSession(completed, minutes) {
  const t = timer;
  update((s) => {
    const session = {
      id: t.sessionId || uid('focus'),
      taskId: t.taskId,
      mode: t.mode,
      plannedMin: Math.round(t.totalMs / 60000),
      actualMin: minutes,
      completed,
      startedAt: t.startedAt,
      endedAt: Date.now(),
    };
    if (s.focusSessions.some((x) => x.id === session.id)) return;
    s.focusSessions.push(session);
    if (completed && t.mode === 'work') {
      const task = s.tasks.find((x) => x.id === t.taskId);
      award(s, {
        key: `focus:${session.id}`,
        activity: 'focus',
        xp: XP.focus,
        label: task ? `Focus session: ${task.title}` : 'Focus session',
      });
    }
  });
}

function complete() {
  const finished = { ...timer };
  clearInterval(interval);
  if (finished.mode === 'work') recordSession(true, Math.round(finished.totalMs / 60000));
  const next = nextMode();
  timer = fresh(next.mode, next.cycle, finished.taskId);
  save();
  completeListeners.forEach((fn) => fn(finished, timer));
  if (next.mode !== 'work' && getState().settings.focus.autoStartBreaks) start();
  else emit();
}
