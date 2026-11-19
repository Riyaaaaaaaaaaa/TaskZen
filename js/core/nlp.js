// Natural-language quick add, done with deterministic rules (no AI service).
// "Remind me to call John tomorrow at 10" → { title: "Call John", dueDate: <tomorrow>, dueTime: "10:00" }
import { addDays, fromDateKey, minToTime, toDateKey } from './utils.js';

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WD = '(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|nesday|rsday|urday|sday)?';
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MON = '(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?';

const weekdayIndex = (s) => WEEKDAYS.findIndex((w) => w.startsWith(s.slice(0, 3).toLowerCase()));

/** The coming occurrence of a weekday ("friday" / "next friday"), never today. */
function nextWeekday(today, idx) {
  const cur = fromDateKey(today).getDay();
  return addDays(today, (idx - cur + 7) % 7 || 7);
}

function dateFromMonthDay(today, month, day) {
  const t = fromDateKey(today);
  let d = new Date(t.getFullYear(), month, day);
  if (toDateKey(d) < today) d = new Date(t.getFullYear() + 1, month, day);
  return toDateKey(d);
}

function to24(h, m, ampm) {
  h = Number(h);
  m = Number(m || 0);
  if (h > 23 || m > 59) return null;
  if (ampm) {
    ampm = ampm.toLowerCase();
    if (h > 12) return null;
    if (ampm.startsWith('p') && h < 12) h += 12;
    if (ampm.startsWith('a') && h === 12) h = 0;
  } else if (h >= 1 && h <= 7) {
    h += 12; // "at 3" almost always means 3pm
  }
  return minToTime(h * 60 + m);
}

/**
 * @param {string} input
 * @param {{ now?: Date, categories?: {id:string,name:string}[] }} opts
 */
export function parseTaskInput(input, { now = new Date(), categories = [] } = {}) {
  const today = toDateKey(now);
  let text = ` ${input.trim()} `;
  const out = { title: '', dueDate: null, dueTime: null, priority: null, categoryId: null, labels: [], estimate: null };
  const take = (re, fn) => {
    const m = text.match(re);
    if (!m) return false;
    const ok = fn(m);
    if (ok !== false) text = text.replace(m[0], ' ');
    return ok !== false;
  };

  take(/^\s*(remind me to|remind me|don'?t forget to|i need to|i have to|todo:?)\s+/i, () => true);

  // #category or #label
  let m;
  const tagRe = /\s#([\w-]+)/;
  while ((m = text.match(tagRe))) {
    const tag = m[1].toLowerCase();
    const cat = categories.find((c) => c.id === tag || c.name.toLowerCase() === tag);
    if (cat && !out.categoryId) out.categoryId = cat.id;
    else out.labels.push(tag);
    text = text.replace(m[0], ' ');
  }

  // priority
  take(/\s!(low|medium|med|high|urgent)\b/i, (x) => {
    out.priority = { med: 'medium' }[x[1].toLowerCase()] || x[1].toLowerCase();
  });
  if (!out.priority) take(/\s!!!(?=\s)/, () => (out.priority = 'urgent'));
  if (!out.priority) take(/\s(urgent|asap)(?=[\s,.!]|$)/i, () => (out.priority = 'urgent'));
  if (!out.priority) take(/\s(important|high priority)(?=[\s,.!]|$)/i, () => (out.priority = 'high'));

  // duration: "for 30 min", "for 1.5 hours"
  take(/\sfor (\d+(?:\.\d+)?)\s*(m|min|mins|minutes|h|hr|hrs|hour|hours)\b/i, (x) => {
    const n = Number(x[1]);
    out.estimate = Math.round(x[2].toLowerCase().startsWith('h') ? n * 60 : n);
  });

  // dates
  const datePrefix = '(?:on |by |due |this )?';
  take(/\s(?:on |by )?(\d{4})-(\d{2})-(\d{2})\b/, (x) => (out.dueDate = `${x[1]}-${x[2]}-${x[3]}`)) ||
    take(/\s(?:the )?day after tomorrow\b/i, () => (out.dueDate = addDays(today, 2))) ||
    take(new RegExp(`\\s${datePrefix}(today)\\b`, 'i'), () => (out.dueDate = today)) ||
    take(/\s(tonight)\b/i, () => {
      out.dueDate = today;
      out.dueTime = out.dueTime || '20:00';
    }) ||
    take(new RegExp(`\\s${datePrefix}(tomorrow|tmrw|tmr)\\b`, 'i'), () => (out.dueDate = addDays(today, 1))) ||
    take(/\sin (\d+) (day|days|week|weeks)\b/i, (x) => {
      out.dueDate = addDays(today, Number(x[1]) * (x[2].startsWith('w') ? 7 : 1));
    }) ||
    take(/\snext week\b/i, () => (out.dueDate = addDays(today, 7))) ||
    take(new RegExp(`\\s(?:on |by |due |this |next )?${WD}\\b`, 'i'), (x) => {
      const idx = weekdayIndex(x[1]);
      if (idx < 0) return false;
      out.dueDate = nextWeekday(today, idx);
    }) ||
    take(new RegExp(`\\s${datePrefix}${MON} (\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i'), (x) => {
      out.dueDate = dateFromMonthDay(today, MONTHS.indexOf(x[1].slice(0, 3).toLowerCase()), Number(x[2]));
    }) ||
    take(new RegExp(`\\s${datePrefix}(\\d{1,2})(?:st|nd|rd|th)? (?:of )?${MON}\\b`, 'i'), (x) => {
      out.dueDate = dateFromMonthDay(today, MONTHS.indexOf(x[2].slice(0, 3).toLowerCase()), Number(x[1]));
    });

  // times
  take(/\s(?:at |@ ?)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)(?=[\s,.!]|$)/i, (x) => {
    const t = to24(x[1], x[2], x[3].replace(/\./g, ''));
    if (!t) return false;
    out.dueTime = t;
  }) ||
    take(/\s(?:at |@ ?)(\d{1,2})(?::(\d{2}))?(?=[\s,.!]|$)/i, (x) => {
      const t = to24(x[1], x[2]);
      if (!t) return false;
      out.dueTime = t;
    }) ||
    take(/\s(\d{1,2}):(\d{2})(?=[\s,.!]|$)/, (x) => {
      const t = x[1].startsWith('0') ? to24(Number(x[1]) || 0, x[2], 'am') : to24(x[1], x[2]);
      if (!t) return false;
      out.dueTime = t;
    }) ||
    take(/\s(?:at )?(noon|midday)\b/i, () => (out.dueTime = '12:00')) ||
    take(/\s(?:at )?midnight\b/i, () => (out.dueTime = '23:59')) ||
    take(/\s(?:in the |this )?(morning|afternoon|evening)\b/i, (x) => {
      out.dueTime = { morning: '09:00', afternoon: '14:00', evening: '18:00' }[x[1].toLowerCase()];
    });

  // A bare time means today, or tomorrow if that time has already passed.
  if (out.dueTime && !out.dueDate) {
    const [h, mm] = out.dueTime.split(':').map(Number);
    out.dueDate = h * 60 + mm > now.getHours() * 60 + now.getMinutes() ? today : addDays(today, 1);
  }

  let title = text.replace(/\s+/g, ' ').trim().replace(/\s+(on|at|by|due)$/i, '').replace(/[,\s]+$/, '');
  title = title.charAt(0).toUpperCase() + title.slice(1);
  out.title = title || input.trim();
  return out;
}
