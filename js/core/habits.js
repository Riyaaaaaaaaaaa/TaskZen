// Habit logic. Habit check-ins live in state.habitLogs, separate from tasks.
// Missing a day only ends the *current* streak; totals, best streak and the
// completion history are always kept.
import { addDays, diffDays, startOfWeek, toDateKey, todayKey, fromDateKey } from './utils.js';
import { normalizeHabit } from './model.js';

// Imported lazily by functions below to avoid a circular import at load time.
import * as game from './gamification.js';

export const HABIT_ICONS = [
  'droplets', 'book-open', 'dumbbell', 'brain', 'graduation-cap', 'moon', 'apple', 'footprints',
  'pen-line', 'music', 'sun', 'heart', 'leaf', 'bike', 'coffee', 'sparkles',
];

export const HABIT_TEMPLATES = [
  { name: 'Drink enough water', icon: 'droplets', color: 'sky', categoryId: 'health' },
  { name: 'Read for 20 minutes', icon: 'book-open', color: 'peach', categoryId: 'personal' },
  { name: 'Exercise', icon: 'dumbbell', color: 'mint', categoryId: 'health' },
  { name: 'Meditate', icon: 'brain', color: 'violet', categoryId: 'health' },
  { name: 'Learn something new', icon: 'graduation-cap', color: 'yellow', categoryId: 'personal' },
  { name: 'Sleep on time', icon: 'moon', color: 'sky', categoryId: 'health' },
];

export const MAX_BACKFILL_DAYS = 7;

const createdKey = (h) => toDateKey(new Date(h.createdAt));

export function isScheduledOn(habit, date) {
  const s = habit.schedule;
  if (s.type === 'days') return s.days.includes(fromDateKey(date).getDay());
  return true; // daily, and weekly habits can be done any day
}

export const habitDoneOn = (state, habitId, date) => !!state.habitLogs[habitId]?.[date];

export function addHabit(state, data, now = Date.now()) {
  const h = normalizeHabit({ ...data, createdAt: now }, now);
  state.habits.push(h);
  return h;
}

export function updateHabit(state, id, patch) {
  const h = state.habits.find((x) => x.id === id);
  if (!h) return null;
  Object.assign(h, normalizeHabit({ ...h, ...patch }));
  return h;
}

export function deleteHabit(state, id) {
  state.habits = state.habits.filter((h) => h.id !== id);
  delete state.habitLogs[id];
  // XP already earned for genuine check-ins is kept.
}

/** Check a habit in or out for a date. Returns true if now done. */
export function toggleHabit(state, id, date = todayKey(), now = Date.now()) {
  const today = todayKey(new Date(now));
  const age = diffDays(date, today);
  if (age < 0 || age > MAX_BACKFILL_DAYS) return habitDoneOn(state, id, date);
  const habit = state.habits.find((h) => h.id === id);
  if (!habit) return false;
  const logs = (state.habitLogs[id] ||= {});
  const key = `habit:${id}:${date}`;
  if (logs[date]) {
    delete logs[date];
    game.revoke(state, key);
    return false;
  }
  logs[date] = now;
  game.award(state, { key, activity: 'habit', xp: game.XP.habit, label: `Habit: ${habit.name}`, now });
  return true;
}

function weekCount(state, habit, weekStartKey) {
  let n = 0;
  for (let i = 0; i < 7; i++) if (habitDoneOn(state, habit.id, addDays(weekStartKey, i))) n++;
  return n;
}

/** Streaks, totals, success rates and missed days for one habit. */
export function habitStats(state, habit, today = todayKey(), weekStart = 1) {
  const logs = state.habitLogs[habit.id] || {};
  const total = Object.keys(logs).length;
  const created = createdKey(habit);

  if (habit.schedule.type === 'weekly') {
    const target = habit.schedule.timesPerWeek;
    const thisWeek = startOfWeek(today, weekStart);
    const thisCount = weekCount(state, habit, thisWeek);
    // current streak in weeks: this week counts if already met, otherwise start from last week
    let w = thisCount >= target ? thisWeek : addDays(thisWeek, -7);
    let current = 0;
    while (w >= startOfWeek(created, weekStart) && weekCount(state, habit, w) >= target) {
      current++;
      w = addDays(w, -7);
    }
    let best = 0;
    let run = 0;
    for (let x = startOfWeek(created, weekStart); x <= thisWeek; x = addDays(x, 7)) {
      if (weekCount(state, habit, x) >= target) best = Math.max(best, ++run);
      else if (x !== thisWeek) run = 0;
    }
    const rate = (weeks) => {
      let hit = 0;
      let n = 0;
      for (let i = 0; i < weeks; i++) {
        const x = addDays(thisWeek, -7 * i);
        if (x < startOfWeek(created, weekStart)) break;
        n += target;
        hit += Math.min(target, weekCount(state, habit, x));
      }
      return n ? hit / n : 0;
    };
    return {
      unit: 'weeks', current, best, total, thisWeek: thisCount, target,
      weeklyRate: rate(1), monthlyRate: rate(4), missed: missedDays(state, habit, today),
    };
  }

  // daily / specific days
  let d = today;
  if (!logs[d]) d = addDays(d, -1); // today is still open
  let current = 0;
  while (d >= created) {
    if (isScheduledOn(habit, d)) {
      if (logs[d]) current++;
      else break;
    }
    d = addDays(d, -1);
  }
  let best = 0;
  let run = 0;
  for (let x = created; x <= today; x = addDays(x, 1)) {
    if (!isScheduledOn(habit, x)) continue;
    if (logs[x]) best = Math.max(best, ++run);
    else if (x !== today) run = 0;
  }
  const rate = (days) => {
    let hit = 0;
    let n = 0;
    for (let i = 0; i < days; i++) {
      const x = addDays(today, -i);
      if (x < created) break;
      if (!isScheduledOn(habit, x)) continue;
      if (x === today && !logs[x]) continue; // don't count today against you yet
      n++;
      if (logs[x]) hit++;
    }
    return n ? hit / n : 0;
  };
  return {
    unit: 'days', current, best, total,
    weeklyRate: rate(7), monthlyRate: rate(30), missed: missedDays(state, habit, today),
  };
}

/** Scheduled days in the last 30 (excluding today) that were not completed. */
export function missedDays(state, habit, today = todayKey()) {
  if (habit.schedule.type === 'weekly') return 0;
  const created = createdKey(habit);
  let missed = 0;
  for (let i = 1; i <= 30; i++) {
    const x = addDays(today, -i);
    if (x < created) break;
    if (isScheduledOn(habit, x) && !habitDoneOn(state, habit.id, x)) missed++;
  }
  return missed;
}

export function habitsDueToday(state, today = todayKey()) {
  return state.habits.filter((h) => !h.archived && isScheduledOn(h, today));
}
