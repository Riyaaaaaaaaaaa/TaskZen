// Pure helpers shared by the whole app. No DOM access here so the core
// modules can be unit-tested outside the browser.

export const uid = (prefix = 'id') =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const pad = (n) => String(n).padStart(2, '0');

/** Local-timezone YYYY-MM-DD for a Date (never UTC). */
export function toDateKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parse a YYYY-MM-DD key into a local Date at midnight. */
export function fromDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const todayKey = (now = new Date()) => toDateKey(now);

export function addDays(key, n) {
  const d = fromDateKey(key);
  d.setDate(d.getDate() + n);
  return toDateKey(d);
}

export function addMonths(key, n) {
  const d = fromDateKey(key);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toDateKey(d);
}

export function diffDays(a, b) {
  // whole days from a to b (b - a)
  return Math.round((fromDateKey(b) - fromDateKey(a)) / 86400000);
}

/** Start of the week containing key. weekStart: 0 = Sunday, 1 = Monday. */
export function startOfWeek(key, weekStart = 1) {
  const d = fromDateKey(key);
  const shift = (d.getDay() - weekStart + 7) % 7;
  return addDays(key, -shift);
}

export function weekDays(key, weekStart = 1) {
  const s = startOfWeek(key, weekStart);
  return Array.from({ length: 7 }, (_, i) => addDays(s, i));
}

export function monthKey(key) {
  return key.slice(0, 7);
}

export function daysInMonthKeys(key) {
  const d = fromDateKey(key);
  const n = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return Array.from({ length: n }, (_, i) => `${key.slice(0, 8)}${pad(i + 1)}`);
}

/** Minutes since midnight from "HH:MM". */
export function timeToMin(t) {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function minToTime(min) {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export function formatTime(t, format = '12') {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  if (format === '24') return `${pad(h)}:${pad(m)}`;
  const suffix = h >= 12 ? 'pm' : 'am';
  const hh = h % 12 || 12;
  return m ? `${hh}:${pad(m)}${suffix}` : `${hh}${suffix}`;
}

export function formatDate(key, opts = { month: 'short', day: 'numeric' }) {
  if (!key) return '';
  return fromDateKey(key).toLocaleDateString(undefined, opts);
}

export function relativeDay(key, today = todayKey()) {
  if (!key) return '';
  const n = diffDays(today, key);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n > 1 && n < 7) return fromDateKey(key).toLocaleDateString(undefined, { weekday: 'long' });
  return formatDate(key);
}

export function formatMinutes(min) {
  min = Math.round(min || 0);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Escape user content before it goes into an HTML template. */
export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export const deepClone = (o) => JSON.parse(JSON.stringify(o));

/** Small deterministic hash so "daily" content is stable for a date. */
export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
