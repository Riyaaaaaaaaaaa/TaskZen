// XP, levels, streaks, achievements and daily challenges.
// XP is stored as a ledger of entries keyed by the activity that earned them
// (e.g. "task:<id>", "habit:<id>:<date>"). A key can only be in the ledger once,
// so toggling, re-completing or re-rendering can never award XP twice.
import { addDays, hashString, toDateKey, todayKey } from './utils.js';
import { habitDoneOn, isScheduledOn } from './habits.js';

export const XP = {
  task: 10,
  highPriorityBonus: 5,
  habit: 5,
  focus: 15,
  allDaily: 30,
  streak7: 50,
  challenge: 20,
};

// Sensible ceilings on repeatable rewards (per local day).
export const DAILY_CAPS = { task: 30, focus: 12 };

export const LEVELS = [
  { level: 1, name: 'Beginner', min: 0 },
  { level: 2, name: 'Getting Started', min: 100 },
  { level: 3, name: 'Consistent', min: 300 },
  { level: 4, name: 'Productivity Pro', min: 700 },
  { level: 5, name: 'Zen Master', min: 1500 },
];

export const energyFor = (xp) => Math.ceil(xp / 2);

export function hasReward(state, key) {
  return state.xp.some((e) => e.key === key);
}

function countToday(state, activity, now) {
  const today = toDateKey(new Date(now));
  return state.xp.filter((e) => e.activity === activity && toDateKey(new Date(e.ts)) === today).length;
}

/** Add an XP entry unless the key was already rewarded or today's cap is reached. */
export function award(state, { key, activity, xp, label, now = Date.now() }) {
  if (!xp || hasReward(state, key)) return null;
  const cap = DAILY_CAPS[activity];
  if (cap && countToday(state, activity, now) >= cap) return null;
  const entry = { id: `xp_${key}`, key, activity, xp, energy: energyFor(xp), ts: now, label };
  state.xp.push(entry);
  return entry;
}

export function revoke(state, key) {
  const before = state.xp.length;
  state.xp = state.xp.filter((e) => e.key !== key);
  return before !== state.xp.length;
}

export const totalXP = (state) => state.xp.reduce((s, e) => s + e.xp, 0);

export function levelInfo(xp) {
  let cur = LEVELS[0];
  for (const l of LEVELS) if (xp >= l.min) cur = l;
  const next = LEVELS.find((l) => l.level === cur.level + 1) || null;
  const progress = next ? (xp - cur.min) / (next.min - cur.min) : 1;
  return { ...cur, xp, next, progress, toNext: next ? next.min - xp : 0 };
}

export function energyBalance(state) {
  const earned = state.xp.reduce((s, e) => s + (e.energy || 0), 0);
  const spent = state.garden.spent.reduce((s, e) => s + e.cost, 0);
  return { earned, spent, balance: earned - spent };
}

// ---------- task completion rewards ----------

export function rewardTaskCompletion(state, task, now = Date.now()) {
  const bonus = task.priority === 'high' || task.priority === 'urgent' ? XP.highPriorityBonus : 0;
  return award(state, {
    key: `task:${task.id}`,
    activity: 'task',
    xp: XP.task + bonus,
    label: `Completed “${task.title}”`,
    now,
  });
}

export const revokeTaskCompletion = (state, task) => revoke(state, `task:${task.id}`);

// ---------- streaks ----------

/** Set of local dates on which the user completed a task or a habit. */
export function activeDays(state) {
  const days = new Set();
  for (const t of state.tasks) if (t.completedAt) days.add(toDateKey(new Date(t.completedAt)));
  for (const logs of Object.values(state.habitLogs)) for (const d of Object.keys(logs)) days.add(d);
  return days;
}

/**
 * Current productivity streak: consecutive active days ending today, or ending
 * yesterday if nothing has been done yet today (the streak is still alive).
 */
export function productivityStreak(state, now = Date.now()) {
  const days = activeDays(state);
  let day = todayKey(new Date(now));
  if (!days.has(day)) day = addDays(day, -1);
  let n = 0;
  let start = day;
  while (days.has(day)) {
    n++;
    start = day;
    day = addDays(day, -1);
  }
  return { length: n, start };
}

export function bestStreak(state) {
  const days = [...activeDays(state)].sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const d of days) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

// ---------- daily tasks ----------

export function tasksDueOn(state, date) {
  return state.tasks.filter((t) => !t.archived && t.dueDate === date);
}

export function allDailyDone(state, date) {
  const due = tasksDueOn(state, date);
  return due.length > 0 && due.every((t) => t.status === 'done');
}

// ---------- daily challenges ----------

const completedOn = (state, date) =>
  state.tasks.filter((t) => t.completedAt && toDateKey(new Date(t.completedAt)) === date);
const focusOn = (state, date) =>
  state.focusSessions.filter((f) => f.completed && f.mode === 'work' && toDateKey(new Date(f.endedAt)) === date);

const CHALLENGE_POOL = [
  { id: 'complete3', label: 'Complete 3 tasks', icon: 'check-check', target: 3, progress: (s, d) => completedOn(s, d).length },
  { id: 'complete5', label: 'Complete 5 tasks', icon: 'list-checks', target: 5, progress: (s, d) => completedOn(s, d).length },
  {
    id: 'highpri', label: 'Finish a high-priority task', icon: 'flame', target: 1,
    progress: (s, d) => completedOn(s, d).filter((t) => t.priority === 'high' || t.priority === 'urgent').length,
  },
  { id: 'focus1', label: 'Finish a focus session', icon: 'timer', target: 1, progress: (s, d) => focusOn(s, d).length },
  { id: 'focus2', label: 'Finish 2 focus sessions', icon: 'brain', target: 2, progress: (s, d) => focusOn(s, d).length },
  {
    id: 'morning', label: 'Complete a task before noon', icon: 'sunrise', target: 1,
    progress: (s, d) => completedOn(s, d).filter((t) => new Date(t.completedAt).getHours() < 12).length,
  },
  {
    id: 'habits', label: 'Check off every habit due today', icon: 'repeat', target: 1, needsHabits: true,
    progress: (s, d) => {
      const due = s.habits.filter((h) => !h.archived && isScheduledOn(h, d));
      return due.length && due.every((h) => habitDoneOn(s, h.id, d)) ? 1 : 0;
    },
  },
];

export function dailyChallenges(state, date = todayKey()) {
  const hasHabits = state.habits.some((h) => !h.archived);
  const pool = CHALLENGE_POOL.filter((c) => !c.needsHabits || hasHabits);
  // Deterministic pick: same three challenges all day, different tomorrow.
  const ranked = [...pool].sort((a, b) => hashString(date + a.id) - hashString(date + b.id));
  return ranked.slice(0, 3).map((c) => {
    const progress = Math.min(c.target, c.progress(state, date));
    return { ...c, progress, done: progress >= c.target, key: `challenge:${date}:${c.id}` };
  });
}

// ---------- achievements ----------

export const ACHIEVEMENTS = [
  { id: 'first_step', name: 'First Step', desc: 'Complete your first task', icon: 'footprints', color: 'mint' },
  { id: 'early_bird', name: 'Early Bird', desc: 'Complete a task before 9am', icon: 'sunrise', color: 'yellow' },
  { id: 'consistency_king', name: 'Consistency King', desc: 'Reach a 7-day streak', icon: 'crown', color: 'violet' },
  { id: 'focus_champion', name: 'Focus Champion', desc: 'Finish 10 focus sessions', icon: 'target', color: 'sky' },
  { id: 'task_slayer', name: 'Task Slayer', desc: 'Complete 100 tasks', icon: 'swords', color: 'peach' },
  { id: 'perfectionist', name: 'Perfectionist', desc: 'Complete all of a day’s tasks', icon: 'gem', color: 'pink' },
  { id: 'habit_hero', name: 'Habit Hero', desc: 'Log 30 habit check-ins', icon: 'repeat', color: 'mint' },
  { id: 'green_thumb', name: 'Green Thumb', desc: 'Place 5 items in your Zen Garden', icon: 'sprout', color: 'mint' },
  { id: 'challenger', name: 'Challenger', desc: 'Complete 5 daily challenges', icon: 'medal', color: 'yellow' },
  { id: 'zen_master', name: 'Zen Master', desc: 'Reach level 5', icon: 'flower-2', color: 'violet' },
];

export function achievementStats(state, now = Date.now()) {
  const completed = state.tasks.filter((t) => t.completedAt);
  return {
    completedTasks: completed.length,
    earlyBird: completed.some((t) => new Date(t.completedAt).getHours() < 9),
    streak: Math.max(productivityStreak(state, now).length, bestStreak(state)),
    focusSessions: state.focusSessions.filter((f) => f.completed && f.mode === 'work').length,
    perfectDays: state.xp.filter((e) => e.activity === 'allDaily').length,
    habitChecks: Object.values(state.habitLogs).reduce((s, l) => s + Object.keys(l).length, 0),
    gardenItems: state.garden.items.length,
    challenges: state.xp.filter((e) => e.activity === 'challenge').length,
    level: levelInfo(totalXP(state)).level,
  };
}

const ACHIEVEMENT_TESTS = {
  first_step: (s) => s.completedTasks >= 1,
  early_bird: (s) => s.earlyBird,
  consistency_king: (s) => s.streak >= 7,
  focus_champion: (s) => s.focusSessions >= 10,
  task_slayer: (s) => s.completedTasks >= 100,
  perfectionist: (s) => s.perfectDays >= 1,
  habit_hero: (s) => s.habitChecks >= 30,
  green_thumb: (s) => s.gardenItems >= 5,
  challenger: (s) => s.challenges >= 5,
  zen_master: (s) => s.level >= 5,
};

export function achievementProgress(id, stats) {
  const map = {
    first_step: [stats.completedTasks, 1], early_bird: [stats.earlyBird ? 1 : 0, 1],
    consistency_king: [stats.streak, 7], focus_champion: [stats.focusSessions, 10],
    task_slayer: [stats.completedTasks, 100], perfectionist: [stats.perfectDays, 1],
    habit_hero: [stats.habitChecks, 30], green_thumb: [stats.gardenItems, 5],
    challenger: [stats.challenges, 5], zen_master: [stats.level, 5],
  };
  const [v, t] = map[id];
  return { value: Math.min(v, t), target: t };
}

/**
 * Re-check day-level rewards after any change. Runs inside every store update,
 * so it must be idempotent. Returns events the UI can celebrate.
 */
export function evaluate(state, now = Date.now(), xpBefore = totalXP(state)) {
  const events = [];
  const levelBefore = levelInfo(xpBefore).level;
  const today = todayKey(new Date(now));

  // All of today's tasks done → bonus, at most once per day. Once earned it is
  // kept, so adding new tasks for today later never takes it away.
  if (allDailyDone(state, today)) {
    if (award(state, { key: `alldaily:${today}`, activity: 'allDaily', xp: XP.allDaily, label: 'Completed every task due today', now })) {
      events.push({ type: 'allDaily' });
    }
  }

  // 7-day streak milestones (7, 14, 21 …), each awarded once per streak.
  const streak = productivityStreak(state, now);
  for (let n = 7; n <= streak.length; n += 7) {
    if (award(state, { key: `streak:${streak.start}:${n}`, activity: 'streak', xp: XP.streak7, label: `${n}-day streak`, now })) {
      events.push({ type: 'streak', days: n });
    }
  }

  // Daily challenges for today.
  for (const c of dailyChallenges(state, today)) {
    if (c.done && award(state, { key: c.key, activity: 'challenge', xp: XP.challenge, label: `Challenge: ${c.label}`, now })) {
      events.push({ type: 'challenge', label: c.label }); // once per challenge per day
    }
  }

  // Achievements stay unlocked once earned.
  const stats = achievementStats(state, now);
  for (const a of ACHIEVEMENTS) {
    if (!state.achievements[a.id] && ACHIEVEMENT_TESTS[a.id](stats)) {
      state.achievements[a.id] = now;
      events.push({ type: 'achievement', achievement: a });
    }
  }

  const levelAfter = levelInfo(totalXP(state)).level;
  if (levelAfter > levelBefore) events.push({ type: 'levelUp', level: levelInfo(totalXP(state)) });
  return events;
}

export function xpOnDay(state, date) {
  return state.xp.filter((e) => toDateKey(new Date(e.ts)) === date).reduce((s, e) => s + e.xp, 0);
}

