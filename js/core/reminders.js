// Works out which reminders are due right now. Pure: the app decides how to
// show them (in-app toast and, if allowed, a browser notification) and records
// each key in state.notified so nothing is shown twice.
// Note: GitHub Pages is static hosting, so reminders fire only while TaskZen is
// open in a tab. Reliable background reminders would need a push service.
import { addDays, startOfWeek, timeToMin, toDateKey } from './utils.js';
import { activeTasks, isOverdue } from './tasks.js';
import { habitDoneOn, habitsDueToday } from './habits.js';
import { periodSummary } from './insights.js';

export function dueReminders(state, now = new Date()) {
  const prefs = state.settings.notifications;
  const today = toDateKey(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const seen = (k) => !!state.notified[k];
  const out = [];

  if (prefs.deadline) {
    for (const t of activeTasks(state)) {
      if (t.status === 'done' || t.dueDate !== today || !t.dueTime) continue;
      const until = timeToMin(t.dueTime) - nowMin;
      const key = `deadline:${t.id}:${t.dueDate}T${t.dueTime}`;
      if (until >= 0 && until <= prefs.leadMinutes && !seen(key)) {
        out.push({ key, type: 'deadline', title: 'Coming up soon', body: `“${t.title}” is due ${until ? `in ${until} min` : 'now'}.`, route: 'tasks', taskId: t.id });
      }
    }
  }

  if (prefs.overdue) {
    const fresh = activeTasks(state).filter((t) => isOverdue(t, now) && !seen(`overdue:${t.id}:${t.dueDate}`));
    if (fresh.length) {
      out.push({
        key: fresh.map((t) => `overdue:${t.id}:${t.dueDate}`),
        type: 'overdue',
        title: fresh.length === 1 ? 'A task is overdue' : `${fresh.length} tasks are overdue`,
        body: fresh.length === 1 ? `“${fresh[0].title}” has passed its due time.` : fresh.slice(0, 3).map((t) => t.title).join(', '),
        route: 'tasks',
      });
    }
  }

  if (prefs.habit && nowMin >= timeToMin(prefs.habitTime)) {
    const left = habitsDueToday(state, today).filter((h) => !habitDoneOn(state, h.id, today));
    const key = `habit:${today}`;
    if (left.length && !seen(key)) {
      out.push({ key, type: 'habit', title: 'Habit check-in', body: `${left.length} habit${left.length > 1 ? 's' : ''} left today: ${left.map((h) => h.name).slice(0, 3).join(', ')}`, route: 'habits' });
    }
  }

  if (prefs.planning && nowMin >= timeToMin(prefs.planningTime)) {
    const key = `planning:${today}`;
    if (!state.plans[today] && !seen(key)) {
      out.push({ key, type: 'planning', title: 'Plan your day', body: 'Take a minute to plan today with Plan My Day.', route: 'dashboard' });
    }
  }

  if (prefs.weekly) {
    const weekStart = startOfWeek(today, state.settings.weekStart);
    const key = `weekly:${weekStart}`;
    if (!seen(key)) {
      const last = periodSummary(state, 'week', addDays(weekStart, -1), state.settings.weekStart);
      if (last.completed || last.focusMinutes) {
        out.push({ key, type: 'weekly', title: 'Your weekly summary is ready', body: `Last week: ${last.completed} tasks done, ${Math.round(last.focusMinutes)} focus minutes.`, route: 'insights' });
      }
    }
  }
  return out;
}
