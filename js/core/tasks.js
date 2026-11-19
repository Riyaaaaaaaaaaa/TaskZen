// Task operations. Every view (Dashboard, My Tasks, Calendar, Kanban, Focus)
// goes through these so status, completion and XP stay consistent.
import { addDays, addMonths, timeToMin, todayKey, toDateKey, uid, weekDays } from './utils.js';
import { normalizeTask, PRIORITY_WEIGHT } from './model.js';
import { revokeTaskCompletion, rewardTaskCompletion } from './gamification.js';

export const RECURRENCE_LABEL = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', custom: 'Every N days' };

export const getTask = (state, id) => state.tasks.find((t) => t.id === id);

export function createTask(state, data, now = Date.now()) {
  const minOrder = state.tasks.reduce((m, t) => Math.min(m, t.order), 0);
  const task = normalizeTask({ ...data, id: undefined, createdAt: now, updatedAt: now, order: minOrder - 1 }, now);
  if (task.status === 'done') {
    task.status = 'todo'; // completion always goes through setStatus so XP is consistent
    state.tasks.push(task);
    setStatus(state, task.id, 'done', now);
  } else {
    if (task.status === 'in_progress') task.startedAt = now;
    state.tasks.push(task);
  }
  for (const l of task.labels) if (!state.labels.includes(l)) state.labels.push(l);
  return task;
}

export function updateTask(state, id, patch, now = Date.now()) {
  const t = getTask(state, id);
  if (!t) return null;
  const { status, ...rest } = patch;
  Object.assign(t, normalizeTask({ ...t, ...rest, status: t.status, completedAt: t.completedAt }, now), {
    updatedAt: now,
  });
  for (const l of t.labels) if (!state.labels.includes(l)) state.labels.push(l);
  if (status && status !== t.status) setStatus(state, id, status, now);
  return t;
}

/** The single place where a task's status changes. */
export function setStatus(state, id, status, now = Date.now()) {
  const t = getTask(state, id);
  if (!t || t.status === status) return t;
  const wasDone = t.status === 'done';
  t.status = status;
  t.updatedAt = now;
  if (status === 'in_progress' && !t.startedAt) t.startedAt = now;
  if (status === 'done') {
    t.completedAt = now;
    rewardTaskCompletion(state, t, now);
    if (t.recurrence) spawnNextOccurrence(state, t, now);
  } else if (wasDone) {
    t.completedAt = null;
    revokeTaskCompletion(state, t);
    removeUntouchedNextOccurrence(state, t);
  }
  return t;
}

export const completeTask = (state, id, now) => setStatus(state, id, 'done', now);
export const reopenTask = (state, id, now) => setStatus(state, id, 'todo', now);

export function nextDueDate(task, from = todayKey()) {
  const base = task.dueDate || from;
  const { type, interval } = task.recurrence;
  if (type === 'daily') return addDays(base, interval);
  if (type === 'weekly') return addDays(base, 7 * interval);
  if (type === 'monthly') return addMonths(base, interval);
  return addDays(base, interval); // custom: every N days
}

function spawnNextOccurrence(state, t, now) {
  if (t.nextOccurrenceId && getTask(state, t.nextOccurrenceId)) return;
  const seriesId = t.seriesId || t.id;
  t.seriesId = seriesId;
  const next = normalizeTask(
    {
      ...t,
      id: uid('task'),
      status: 'todo',
      completedAt: null,
      startedAt: null,
      dueDate: nextDueDate(t, toDateKey(new Date(now))),
      subtasks: t.subtasks.map((s) => ({ ...s, id: uid('sub'), done: false })),
      createdAt: now,
      updatedAt: now,
      archived: false,
      seriesId,
      migrated: false,
    },
    now,
  );
  next.spawnedAt = now;
  next.nextOccurrenceId = null;
  state.tasks.push(next);
  t.nextOccurrenceId = next.id;
}

function removeUntouchedNextOccurrence(state, t) {
  const next = t.nextOccurrenceId && getTask(state, t.nextOccurrenceId);
  if (next && next.status === 'todo' && next.updatedAt === next.spawnedAt) {
    state.tasks = state.tasks.filter((x) => x.id !== next.id);
  }
  t.nextOccurrenceId = null;
}

export function deleteTasks(state, ids) {
  const set = new Set(ids);
  // Deleting removes XP earned from that task, so create→complete→delete can't farm XP.
  // Archive keeps the task (and its XP) out of the way instead.
  for (const t of state.tasks) if (set.has(t.id) && t.status === 'done') revokeTaskCompletion(state, t);
  state.tasks = state.tasks.filter((t) => !set.has(t.id));
}

export function archiveTasks(state, ids, archived = true, now = Date.now()) {
  const set = new Set(ids);
  for (const t of state.tasks) if (set.has(t.id)) Object.assign(t, { archived, updatedAt: now });
}

export function duplicateTask(state, id, now = Date.now()) {
  const t = getTask(state, id);
  if (!t) return null;
  const copy = createTask(
    state,
    {
      ...t,
      title: `${t.title} (copy)`,
      status: 'todo',
      subtasks: t.subtasks.map((s) => ({ title: s.title, done: false })),
      seriesId: null,
      archived: false,
    },
    now,
  );
  // place right after the original
  copy.order = t.order + 0.5;
  return copy;
}

export function toggleSubtask(state, taskId, subId, now = Date.now()) {
  const t = getTask(state, taskId);
  const s = t?.subtasks.find((x) => x.id === subId);
  if (!s) return;
  s.done = !s.done;
  t.updatedAt = now;
}

/** Persist a manual order (ids in display order). */
export function reorder(state, ids) {
  ids.forEach((id, i) => {
    const t = getTask(state, id);
    if (t) t.order = i;
  });
}

/** Move a task to a date (calendar drag & drop / rescheduling). */
export function moveToDate(state, id, date, now = Date.now()) {
  const t = getTask(state, id);
  if (t) Object.assign(t, { dueDate: date, updatedAt: now });
}

// ---------- queries ----------

export function isOverdue(t, now = new Date()) {
  if (t.status === 'done' || t.archived || !t.dueDate) return false;
  const today = toDateKey(now);
  if (t.dueDate < today) return true;
  if (t.dueDate === today && t.dueTime) return timeToMin(t.dueTime) < now.getHours() * 60 + now.getMinutes();
  return false;
}

export const activeTasks = (state) => state.tasks.filter((t) => !t.archived);

export function dueSortValue(t) {
  return t.dueDate ? `${t.dueDate}T${t.dueTime || '23:59'}` : '9999';
}

export function upcomingTasks(state, limit = 5, now = new Date()) {
  return activeTasks(state)
    .filter((t) => t.status !== 'done' && t.dueDate && !isOverdue(t, now))
    .sort((a, b) => dueSortValue(a).localeCompare(dueSortValue(b)))
    .slice(0, limit);
}

export function filterTasks(tasks, f = {}, now = new Date(), weekStart = 1) {
  const today = toDateKey(now);
  const q = (f.search || '').trim().toLowerCase();
  const week = new Set(weekDays(today, weekStart));
  return tasks.filter((t) => {
    if (!!f.archived !== t.archived) return false;
    if (f.category && f.category !== 'all' && t.categoryId !== f.category) return false;
    if (f.priority && f.priority !== 'all' && t.priority !== f.priority) return false;
    if (f.status && f.status !== 'all' && t.status !== f.status) return false;
    if (f.label && f.label !== 'all' && !t.labels.includes(f.label)) return false;
    if (f.date && f.date !== 'all') {
      if (f.date === 'today' && t.dueDate !== today) return false;
      if (f.date === 'overdue' && !isOverdue(t, now)) return false;
      if (f.date === 'week' && !week.has(t.dueDate)) return false;
      if (f.date === 'none' && t.dueDate) return false;
    }
    if (q) {
      const hay = [t.title, t.description, ...t.labels, ...t.subtasks.map((s) => s.title)].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function sortTasks(tasks, mode = 'manual') {
  const list = [...tasks];
  const cmp = {
    manual: (a, b) => a.order - b.order,
    newest: (a, b) => b.createdAt - a.createdAt,
    oldest: (a, b) => a.createdAt - b.createdAt,
    priority: (a, b) => PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority] || dueSortValue(a).localeCompare(dueSortValue(b)),
    deadline: (a, b) => dueSortValue(a).localeCompare(dueSortValue(b)) || PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority],
  }[mode] || ((a, b) => a.order - b.order);
  // completed tasks sink to the bottom in every mode
  return list.sort((a, b) => (a.status === 'done') - (b.status === 'done') || cmp(a, b));
}
