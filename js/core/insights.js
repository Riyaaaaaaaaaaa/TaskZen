// Productivity analytics computed from real recorded data only.
import { addDays, daysInMonthKeys, fromDateKey, monthKey, startOfWeek, toDateKey, weekDays, WEEKDAY_NAMES } from './utils.js';
import { habitDoneOn, isScheduledOn } from './habits.js';
import { activeTasks, isOverdue } from './tasks.js';

const dayOf = (ts) => toDateKey(new Date(ts));

export function completedBetween(state, from, to) {
  return state.tasks.filter((t) => t.completedAt && dayOf(t.completedAt) >= from && dayOf(t.completedAt) <= to);
}

export function focusMinutesBetween(state, from, to) {
  return state.focusSessions
    .filter((f) => f.mode === 'work' && dayOf(f.endedAt) >= from && dayOf(f.endedAt) <= to)
    .reduce((n, f) => n + (f.actualMin || 0), 0);
}

export function completionsPerDay(state, days) {
  const counts = Object.fromEntries(days.map((d) => [d, 0]));
  for (const t of state.tasks) {
    if (!t.completedAt) continue;
    const d = dayOf(t.completedAt);
    if (d in counts) counts[d]++;
  }
  return days.map((d) => ({ date: d, count: counts[d] }));
}

/** Habit check-ins done / scheduled across [from, to]. */
export function habitConsistency(state, from, to) {
  let due = 0;
  let done = 0;
  for (const h of state.habits.filter((x) => !x.archived)) {
    const created = dayOf(h.createdAt);
    for (let d = from > created ? from : created; d <= to; d = addDays(d, 1)) {
      if (h.schedule.type === 'weekly') continue;
      if (!isScheduledOn(h, d)) continue;
      due++;
      if (habitDoneOn(state, h.id, d)) done++;
    }
    if (h.schedule.type === 'weekly') {
      for (let w = startOfWeek(from > created ? from : created); w <= to; w = addDays(w, 7)) {
        due += h.schedule.timesPerWeek;
        let n = 0;
        for (let i = 0; i < 7; i++) if (habitDoneOn(state, h.id, addDays(w, i))) n++;
        done += Math.min(n, h.schedule.timesPerWeek);
      }
    }
  }
  return { due, done, rate: due ? done / due : null };
}

export function categoryBreakdown(state, from, to) {
  const done = completedBetween(state, from, to);
  return state.categories
    .map((c) => {
      const total = activeTasks(state).filter((t) => t.categoryId === c.id).length;
      const completed = done.filter((t) => t.categoryId === c.id).length;
      return { category: c, completed, total };
    })
    .filter((x) => x.total || x.completed);
}

export function mostProductiveWeekday(state) {
  const counts = Array(7).fill(0);
  for (const t of state.tasks) if (t.completedAt) counts[new Date(t.completedAt).getDay()]++;
  const max = Math.max(...counts);
  if (!max) return null;
  const idx = counts.indexOf(max);
  return { day: WEEKDAY_NAMES[idx], count: max, counts };
}

/**
 * Average time to complete, only from tasks with real timing data:
 * started → completed when "In Progress" was used, otherwise created → completed.
 * Tasks migrated from TaskZen 1.x have no timing data and are excluded.
 */
export function averageCompletion(state) {
  const timed = state.tasks.filter((t) => t.completedAt && !t.migrated);
  if (!timed.length) return null;
  const started = timed.filter((t) => t.startedAt);
  const avg = (arr, from) => arr.reduce((n, t) => n + (t.completedAt - t[from]), 0) / arr.length / 60000;
  return {
    createdToDoneMin: avg(timed, 'createdAt'),
    startedToDoneMin: started.length ? avg(started, 'startedAt') : null,
    sample: timed.length,
  };
}

export function periodSummary(state, period = 'week', today = toDateKey(), weekStart = 1) {
  let from;
  let to;
  let prevFrom;
  let prevTo;
  if (period === 'week') {
    from = startOfWeek(today, weekStart);
    to = addDays(from, 6);
    prevFrom = addDays(from, -7);
    prevTo = addDays(from, -1);
  } else {
    const days = daysInMonthKeys(today);
    from = days[0];
    to = days[days.length - 1];
    const prevMonthDay = addDays(from, -1);
    const prevDays = daysInMonthKeys(prevMonthDay);
    prevFrom = prevDays[0];
    prevTo = prevDays[prevDays.length - 1];
  }
  const completed = completedBetween(state, from, to);
  const dueInPeriod = activeTasks(state).filter((t) => t.dueDate && t.dueDate >= from && t.dueDate <= to);
  const doneDue = dueInPeriod.filter((t) => t.status === 'done').length;
  const unfinished = activeTasks(state).filter(
    (t) => t.status !== 'done' && t.dueDate && t.dueDate >= from && t.dueDate <= (to < today ? to : today),
  );
  return {
    period, from, to,
    completed: completed.length,
    previousCompleted: completedBetween(state, prevFrom, prevTo).length,
    completionRate: dueInPeriod.length ? doneDue / dueInPeriod.length : null,
    dueCount: dueInPeriod.length,
    focusMinutes: focusMinutesBetween(state, from, to),
    focusSessions: state.focusSessions.filter((f) => f.completed && f.mode === 'work' && dayOf(f.endedAt) >= from && dayOf(f.endedAt) <= to).length,
    habits: habitConsistency(state, from, to > today ? today : to),
    xp: state.xp.filter((e) => dayOf(e.ts) >= from && dayOf(e.ts) <= to).reduce((n, e) => n + e.xp, 0),
    unfinished,
    highlights: completed
      .filter((t) => t.priority === 'high' || t.priority === 'urgent')
      .slice(0, 5),
    categories: categoryBreakdown(state, from, to),
  };
}

/** Completed tasks per week for the last n weeks (oldest first). */
export function weeklyHistory(state, n = 12, today = toDateKey(), weekStart = 1) {
  const thisWeek = startOfWeek(today, weekStart);
  return Array.from({ length: n }, (_, i) => {
    const from = addDays(thisWeek, -7 * (n - 1 - i));
    const to = addDays(from, 6);
    return {
      from,
      label: fromDateKey(from).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      completed: completedBetween(state, from, to).length,
      focus: focusMinutesBetween(state, from, to),
    };
  });
}

export function overviewCounts(state, now = new Date()) {
  const tasks = activeTasks(state);
  return {
    total: tasks.length,
    completed: tasks.filter((t) => t.status === 'done').length,
    pending: tasks.filter((t) => t.status !== 'done').length,
    overdue: tasks.filter((t) => isOverdue(t, now)).length,
  };
}

export const thisWeekDays = (today, weekStart) => weekDays(today, weekStart);
export { monthKey };
