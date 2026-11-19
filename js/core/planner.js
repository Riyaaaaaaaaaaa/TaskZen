// Smart Day Planner and Smart Rescheduling. Deterministic rules only — it
// weighs deadlines, priority, estimated duration and the user's energy level.
import { addDays, diffDays, minToTime, timeToMin, toDateKey } from './utils.js';
import { PRIORITY_WEIGHT } from './model.js';
import { activeTasks, isOverdue } from './tasks.js';

export const DEFAULT_ESTIMATE = 30;
const BREAK_AFTER = { low: 50, medium: 75, high: 90 }; // minutes of work before a break
const BREAK_LENGTH = { low: 15, medium: 10, high: 10 };
const QUICK_WIN = 20;

export function scoreTask(t, date, now = new Date()) {
  let score = PRIORITY_WEIGHT[t.priority] * 10;
  const reasons = [];
  if (isOverdue(t, now) && t.dueDate < date) {
    score += 50;
    reasons.push('Overdue');
  } else if (t.dueDate === date) {
    score += 30;
    reasons.push('Due today');
  } else if (t.dueDate) {
    const d = diffDays(date, t.dueDate);
    if (d === 1) {
      score += 15;
      reasons.push('Due tomorrow');
    } else if (d <= 3) {
      score += 8;
      reasons.push('Due soon');
    }
  }
  if (t.priority === 'urgent') reasons.unshift('Urgent');
  else if (t.priority === 'high') reasons.unshift('High priority');
  if (t.status === 'in_progress') {
    score += 6;
    reasons.push('Already started');
  }
  return { score, reasons };
}

export function planCandidates(state, date, now = new Date()) {
  return activeTasks(state).filter((t) => {
    if (t.status === 'done') return false;
    if (!t.dueDate) return t.priority === 'high' || t.priority === 'urgent' || t.status === 'in_progress';
    return t.dueDate <= addDays(date, 3);
  });
}

/**
 * Build a suggested schedule.
 * @returns {{ items: {taskId,start,end,minutes,reasons}[], breaks: {start,end}[], overflow: string[], scheduledMinutes: number, availableMinutes: number }}
 */
export function planDay(state, { date, start = '09:00', end = '17:00', energy = 'medium', now = new Date() }) {
  let cursor = timeToMin(start);
  if (date === toDateKey(now)) {
    const nowMin = Math.ceil((now.getHours() * 60 + now.getMinutes()) / 5) * 5;
    cursor = Math.max(cursor, nowMin);
  }
  const endMin = timeToMin(end);
  const available = Math.max(0, endMin - cursor);

  const scored = planCandidates(state, date, now).map((t) => ({
    t,
    minutes: t.estimate || DEFAULT_ESTIMATE,
    ...scoreTask(t, date, now),
  }));

  scored.sort((a, b) => {
    if (energy === 'low') {
      // a few quick wins first to build momentum, then by importance
      const qa = a.minutes <= QUICK_WIN;
      const qb = b.minutes <= QUICK_WIN;
      if (qa !== qb) return qa ? -1 : 1;
      return b.score - a.score || a.minutes - b.minutes;
    }
    if (energy === 'high') return b.score - a.score || b.minutes - a.minutes; // tackle the big ones while fresh
    return b.score - a.score || a.minutes - b.minutes;
  });
  if (energy === 'low') {
    scored.forEach((s) => s.minutes <= QUICK_WIN && !s.reasons.includes('Quick win') && s.reasons.push('Quick win'));
  }

  const items = [];
  const breaks = [];
  const overflow = [];
  let sinceBreak = 0;
  for (const s of scored) {
    // Low energy: avoid more than one long (> 90 min) block.
    if (energy === 'low' && s.minutes > 90 && items.some((i) => i.minutes > 90)) {
      overflow.push(s.t.id);
      continue;
    }
    if (sinceBreak >= BREAK_AFTER[energy] && cursor + BREAK_LENGTH[energy] + s.minutes <= endMin) {
      breaks.push({ start: minToTime(cursor), end: minToTime(cursor + BREAK_LENGTH[energy]) });
      cursor += BREAK_LENGTH[energy];
      sinceBreak = 0;
    }
    if (cursor + s.minutes > endMin) {
      overflow.push(s.t.id);
      continue;
    }
    items.push({
      taskId: s.t.id,
      start: minToTime(cursor),
      end: minToTime(cursor + s.minutes),
      minutes: s.minutes,
      reasons: s.reasons,
    });
    cursor += s.minutes;
    sinceBreak += s.minutes;
  }
  return {
    date, start, end, energy, items, breaks, overflow,
    scheduledMinutes: items.reduce((n, i) => n + i.minutes, 0),
    availableMinutes: available,
    createdAt: now.getTime(),
  };
}

/** Write a plan onto the tasks (due date + start time) and remember it. */
export function applyPlan(state, plan, now = Date.now()) {
  for (const item of plan.items) {
    const t = state.tasks.find((x) => x.id === item.taskId);
    if (t) Object.assign(t, { dueDate: plan.date, dueTime: item.start, updatedAt: now });
  }
  state.plans[plan.date] = { ...plan, appliedAt: now };
}

/** Planned minutes already due on a date (incomplete tasks only). */
export function loadOn(state, date) {
  return activeTasks(state)
    .filter((t) => t.status !== 'done' && t.dueDate === date)
    .reduce((n, t) => n + (t.estimate || DEFAULT_ESTIMATE), 0);
}

/**
 * For every overdue task suggest the first day (from today) with room for it,
 * most important tasks first. capacity = minutes per day.
 */
export function suggestReschedule(state, { now = new Date(), capacity = 360, horizon = 14 } = {}) {
  const today = toDateKey(now);
  const extra = {};
  const overdue = activeTasks(state)
    .filter((t) => isOverdue(t, now) && t.dueDate < today)
    .sort((a, b) => PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority] || a.dueDate.localeCompare(b.dueDate));
  return overdue.map((t) => {
    const need = t.estimate || DEFAULT_ESTIMATE;
    let to = addDays(today, horizon);
    for (let i = 0; i <= horizon; i++) {
      const d = addDays(today, i);
      if (loadOn(state, d) + (extra[d] || 0) + need <= capacity) {
        to = d;
        break;
      }
    }
    extra[to] = (extra[to] || 0) + need;
    return { taskId: t.id, from: t.dueDate, to };
  });
}
