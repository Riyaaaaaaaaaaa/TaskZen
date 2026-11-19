// Data model: defaults, normalisers and the v1 → v2 migration.
// Everything here is UI-independent.
import { uid } from './utils.js';

export const SCHEMA_VERSION = 2;

export const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
export const PRIORITY_WEIGHT = { low: 1, medium: 2, high: 3, urgent: 4 };
export const STATUSES = ['todo', 'in_progress', 'done'];
export const STATUS_LABEL = { todo: 'To Do', in_progress: 'In Progress', done: 'Done' };
export const COLORS = ['violet', 'peach', 'mint', 'sky', 'yellow', 'pink'];

export const DEFAULT_CATEGORIES = [
  { id: 'work', name: 'Work', color: 'violet', icon: 'briefcase' },
  { id: 'personal', name: 'Personal', color: 'peach', icon: 'home' },
  { id: 'health', name: 'Health', color: 'mint', icon: 'heart-pulse' },
];

// Font Awesome icon names used by TaskZen 1.x → Lucide equivalents.
const V1_ICON_MAP = {
  briefcase: 'briefcase', home: 'home', heartbeat: 'heart-pulse', book: 'book-open',
  utensils: 'utensils', dumbbell: 'dumbbell', palette: 'palette', music: 'music',
};

export function defaultSettings() {
  return {
    theme: 'system', // light | dark | system
    weekStart: 1, // 0 Sunday, 1 Monday
    timeFormat: '12',
    defaultCategory: 'personal',
    dailyGoal: 5,
    celebrate: true,
    workdayStart: '09:00',
    workdayEnd: '17:00',
    focus: { work: 25, short: 5, long: 15, longEvery: 4, autoStartBreaks: false, sound: 'none', volume: 0.4 },
    notifications: {
      browser: false, // user must opt in; also requires permission
      deadline: true,
      overdue: true,
      habit: true,
      focus: true,
      planning: true,
      weekly: true,
      leadMinutes: 15,
      habitTime: '20:00',
      planningTime: '08:30',
    },
  };
}

export function defaultState(now = Date.now()) {
  return {
    schemaVersion: SCHEMA_VERSION,
    profile: { name: '', avatar: '🌸', avatarImage: null },
    settings: defaultSettings(),
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    labels: [],
    tasks: [],
    habits: [],
    habitLogs: {}, // { [habitId]: { [YYYY-MM-DD]: timestamp } }
    focusSessions: [],
    xp: [], // XP ledger: { id, key, activity, xp, energy, ts, label }
    achievements: {}, // { [achievementId]: unlockedAt }
    garden: { items: [], rows: 4, cols: 6, season: 'spring', spent: [] },
    notes: '',
    checkins: {}, // { [date]: 'low' | 'medium' | 'high' }
    reflections: {}, // { [date]: { well, improve, mood } }
    plans: {}, // { [date]: plan }
    notified: {}, // { [notificationKey]: ts }
    meta: { createdAt: now, updatedAt: now, migratedFromV1: null, onboarded: false },
  };
}

export function normalizeTask(t = {}, now = Date.now()) {
  const status = STATUSES.includes(t.status) ? t.status : 'todo';
  return {
    id: t.id || uid('task'),
    title: String(t.title || 'Untitled task').slice(0, 300),
    description: String(t.description || ''),
    categoryId: t.categoryId || 'personal',
    priority: PRIORITIES.includes(t.priority) ? t.priority : 'medium',
    status,
    dueDate: t.dueDate || null, // local YYYY-MM-DD
    dueTime: t.dueTime || null, // HH:MM
    subtasks: Array.isArray(t.subtasks)
      ? t.subtasks.map((s) => ({ id: s.id || uid('sub'), title: String(s.title || ''), done: !!s.done }))
      : [],
    recurrence: t.recurrence && t.recurrence.type && t.recurrence.type !== 'none'
      ? { type: t.recurrence.type, interval: Math.max(1, Number(t.recurrence.interval) || 1) }
      : null,
    labels: Array.isArray(t.labels) ? t.labels.map(String) : [],
    estimate: t.estimate ? Math.max(1, Number(t.estimate)) : null, // minutes
    links: Array.isArray(t.links) ? t.links.map(String) : [],
    order: typeof t.order === 'number' ? t.order : now,
    archived: !!t.archived,
    createdAt: t.createdAt ?? now,
    updatedAt: t.updatedAt ?? now,
    startedAt: t.startedAt ?? null,
    completedAt: status === 'done' ? (t.completedAt ?? null) : null,
    seriesId: t.seriesId || null,
    nextOccurrenceId: t.nextOccurrenceId || null,
    spawnedAt: t.spawnedAt ?? null,
    migrated: !!t.migrated,
  };
}

export function normalizeHabit(h = {}, now = Date.now()) {
  const type = ['daily', 'days', 'weekly'].includes(h.schedule?.type) ? h.schedule.type : 'daily';
  return {
    id: h.id || uid('habit'),
    name: String(h.name || 'New habit'),
    icon: h.icon || 'sparkles',
    color: COLORS.includes(h.color) ? h.color : 'violet',
    categoryId: h.categoryId || 'health',
    schedule: {
      type,
      days: Array.isArray(h.schedule?.days) && h.schedule.days.length ? h.schedule.days.map(Number) : [1, 2, 3, 4, 5],
      timesPerWeek: Math.min(7, Math.max(1, Number(h.schedule?.timesPerWeek) || 3)),
    },
    createdAt: h.createdAt ?? now,
    archived: !!h.archived,
  };
}

/** Fill any missing fields so older or imported data keeps working. */
export function normalizeState(raw, now = Date.now()) {
  const base = defaultState(now);
  const s = { ...base, ...(raw || {}) };
  s.schemaVersion = SCHEMA_VERSION;
  s.profile = { ...base.profile, ...(raw?.profile || {}) };
  s.settings = {
    ...base.settings,
    ...(raw?.settings || {}),
    focus: { ...base.settings.focus, ...(raw?.settings?.focus || {}) },
    notifications: { ...base.settings.notifications, ...(raw?.settings?.notifications || {}) },
  };
  s.categories = Array.isArray(raw?.categories) && raw.categories.length ? raw.categories : base.categories;
  s.tasks = (Array.isArray(raw?.tasks) ? raw.tasks : []).map((t) => normalizeTask(t, now));
  s.habits = (Array.isArray(raw?.habits) ? raw.habits : []).map((h) => normalizeHabit(h, now));
  s.garden = { ...base.garden, ...(raw?.garden || {}) };
  for (const k of ['habitLogs', 'achievements', 'checkins', 'reflections', 'plans', 'notified']) {
    s[k] = raw?.[k] && typeof raw[k] === 'object' && !Array.isArray(raw[k]) ? raw[k] : {};
  }
  for (const k of ['focusSessions', 'xp', 'labels']) s[k] = Array.isArray(raw?.[k]) ? raw[k] : [];
  s.meta = { ...base.meta, ...(raw?.meta || {}) };
  return s;
}

const slug = (s) => String(s).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'category';

/**
 * Convert TaskZen 1.x localStorage data ({ text, completed, category } tasks and
 * { name, icon } categories) into the v2 shape. Original keys are left untouched
 * so nothing is lost if anything goes wrong.
 */
export function migrateV1(v1Tasks, v1Categories, now = Date.now()) {
  const state = defaultState(now);
  const palette = ['sky', 'yellow', 'pink', 'violet', 'peach', 'mint'];
  if (Array.isArray(v1Categories)) {
    v1Categories.forEach((c, i) => {
      if (!c || !c.name) return;
      const id = slug(c.name);
      if (state.categories.some((x) => x.id === id)) return;
      state.categories.push({
        id,
        name: c.name.charAt(0).toUpperCase() + c.name.slice(1),
        color: palette[i % palette.length],
        icon: V1_ICON_MAP[c.icon] || 'tag',
      });
    });
  }
  if (Array.isArray(v1Tasks)) {
    v1Tasks.forEach((t, i) => {
      if (!t || typeof t.text !== 'string') return;
      const categoryId = slug(t.category || 'personal');
      if (!state.categories.some((c) => c.id === categoryId)) {
        state.categories.push({ id: categoryId, name: t.category, color: 'sky', icon: 'tag' });
      }
      state.tasks.push(
        normalizeTask(
          {
            title: t.text,
            status: t.completed ? 'done' : 'todo',
            categoryId,
            order: i,
            createdAt: now,
            completedAt: null, // the old app never recorded when
            migrated: true,
          },
          now,
        ),
      );
    });
  }
  state.meta.migratedFromV1 = now;
  return state;
}
