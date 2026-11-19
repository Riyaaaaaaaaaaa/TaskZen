// Run with: bun test
import { describe, expect, test } from 'bun:test';
import { addDays, toDateKey } from '../js/core/utils.js';
import { initStore, getState, update, undo, exportData, importData, addMiddleware } from '../js/core/store.js';
import { migrateV1, defaultState, normalizeState } from '../js/core/model.js';
import * as tasks from '../js/core/tasks.js';
import * as habits from '../js/core/habits.js';
import * as game from '../js/core/gamification.js';
import { parseTaskInput } from '../js/core/nlp.js';
import { planDay, suggestReschedule, applyPlan } from '../js/core/planner.js';
import * as garden from '../js/core/garden.js';
import { periodSummary } from '../js/core/insights.js';
import { dueReminders } from '../js/core/reminders.js';

const NOW = new Date(2026, 10, 19, 10, 0); // Thu 19 Nov 2026, 10:00 local
const TODAY = toDateKey(NOW);

function memory(initial = {}) {
  const m = new Map(Object.entries(initial));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}

describe('migration from TaskZen 1.x', () => {
  test('keeps every task, completion state and custom category', () => {
    const storage = memory({
      tasks: JSON.stringify([
        { text: 'Write report', completed: false, category: 'work' },
        { text: 'Yoga', completed: true, category: 'health' },
        { text: 'Paint', completed: false, category: 'art' },
      ]),
      categories: JSON.stringify([
        { name: 'work', icon: 'briefcase' }, { name: 'personal', icon: 'home' },
        { name: 'health', icon: 'heartbeat' }, { name: 'art', icon: 'palette' },
      ]),
    });
    const s = initStore({ storage, now: NOW.getTime() });
    expect(s.tasks.map((t) => t.title)).toEqual(['Write report', 'Yoga', 'Paint']);
    expect(s.tasks[1].status).toBe('done');
    expect(s.categories.find((c) => c.id === 'art')).toMatchObject({ name: 'Art', icon: 'palette' });
    expect(s.tasks[2].categoryId).toBe('art');
    expect(s.meta.migratedFromV1).toBeTruthy();
    // old keys are left untouched as a safety net
    expect(storage.getItem('tasks')).toContain('Write report');
    // second load reads v2 and does not migrate again
    update((st) => tasks.createTask(st, { title: 'New' }));
    const again = initStore({ storage });
    expect(again.tasks.length).toBe(4);
  });

  test('migrated completed tasks earn no XP', () => {
    const s = migrateV1([{ text: 'x', completed: true, category: 'work' }], null);
    expect(s.xp.length).toBe(0);
  });
});

describe('tasks + XP integrity', () => {
  const fresh = () => {
    const s = defaultState(NOW.getTime());
    return s;
  };

  test('toggling completion never duplicates XP', () => {
    const s = fresh();
    const t = tasks.createTask(s, { title: 'A', priority: 'high' }, NOW.getTime());
    tasks.completeTask(s, t.id, NOW.getTime());
    expect(game.totalXP(s)).toBe(15);
    tasks.reopenTask(s, t.id);
    tasks.completeTask(s, t.id, NOW.getTime());
    tasks.completeTask(s, t.id, NOW.getTime());
    expect(game.totalXP(s)).toBe(15);
  });

  test('create→complete→delete does not farm XP', () => {
    const s = fresh();
    for (let i = 0; i < 5; i++) {
      const t = tasks.createTask(s, { title: 'farm' }, NOW.getTime());
      tasks.completeTask(s, t.id, NOW.getTime());
      tasks.deleteTasks(s, [t.id]);
    }
    expect(game.totalXP(s)).toBe(0);
  });

  test('daily cap on task XP', () => {
    const s = fresh();
    for (let i = 0; i < 40; i++) {
      const t = tasks.createTask(s, { title: `t${i}` }, NOW.getTime());
      tasks.completeTask(s, t.id, NOW.getTime());
    }
    expect(s.xp.filter((e) => e.activity === 'task').length).toBe(game.DAILY_CAPS.task);
  });

  test('recurring task spawns the next occurrence once, and reopening removes it', () => {
    const s = fresh();
    const t = tasks.createTask(s, { title: 'Water plants', dueDate: TODAY, recurrence: { type: 'weekly', interval: 1 } });
    tasks.completeTask(s, t.id, NOW.getTime());
    tasks.completeTask(s, t.id, NOW.getTime());
    expect(s.tasks.length).toBe(2);
    expect(s.tasks[1].dueDate).toBe(addDays(TODAY, 7));
    tasks.reopenTask(s, t.id);
    expect(s.tasks.length).toBe(1);
  });

  test('filters and sorts', () => {
    const s = fresh();
    tasks.createTask(s, { title: 'Low', priority: 'low', dueDate: TODAY });
    tasks.createTask(s, { title: 'Urgent overdue', priority: 'urgent', dueDate: addDays(TODAY, -2) });
    tasks.createTask(s, { title: 'Later', priority: 'medium', dueDate: addDays(TODAY, 20), labels: ['deep'] });
    expect(tasks.filterTasks(s.tasks, { date: 'overdue' }, NOW).map((t) => t.title)).toEqual(['Urgent overdue']);
    expect(tasks.filterTasks(s.tasks, { search: 'DEEP' }, NOW).map((t) => t.title)).toEqual(['Later']);
    expect(tasks.sortTasks(s.tasks, 'priority')[0].title).toBe('Urgent overdue');
    expect(tasks.sortTasks(s.tasks, 'deadline').map((t) => t.title)).toEqual(['Urgent overdue', 'Low', 'Later']);
  });

  test('completing all of today’s tasks awards the daily bonus once', () => {
    const s = fresh();
    const a = tasks.createTask(s, { title: 'a', dueDate: TODAY });
    const b = tasks.createTask(s, { title: 'b', dueDate: TODAY });
    tasks.completeTask(s, a.id, NOW.getTime());
    game.evaluate(s, NOW.getTime());
    expect(game.hasReward(s, `alldaily:${TODAY}`)).toBe(false);
    tasks.completeTask(s, b.id, NOW.getTime());
    const ev = game.evaluate(s, NOW.getTime());
    game.evaluate(s, NOW.getTime());
    expect(s.xp.filter((e) => e.activity === 'allDaily').length).toBe(1);
    expect(ev.some((e) => e.type === 'allDaily')).toBe(true);
    expect(s.achievements.perfectionist).toBeTruthy();
    // adding another task for today later does not take the bonus away
    tasks.createTask(s, { title: 'c', dueDate: TODAY });
    game.evaluate(s, NOW.getTime());
    expect(game.hasReward(s, `alldaily:${TODAY}`)).toBe(true);
  });
});

describe('habits', () => {
  test('missing a day ends the current streak but keeps history', () => {
    const s = defaultState(NOW.getTime() - 20 * 86400000);
    const h = habits.addHabit(s, { name: 'Read' }, NOW.getTime() - 20 * 86400000);
    for (const i of [6, 5, 4, 2, 1, 0]) habits.toggleHabit(s, h.id, addDays(TODAY, -i), NOW.getTime());
    const st = habits.habitStats(s, h, TODAY);
    expect(st.current).toBe(3);
    expect(st.best).toBe(3);
    expect(st.total).toBe(6);
    expect(game.totalXP(s)).toBe(30);
  });

  test('cannot back-fill beyond the allowed window, unchecking revokes XP', () => {
    const s = defaultState(NOW.getTime());
    const h = habits.addHabit(s, { name: 'Water' }, NOW.getTime() - 30 * 86400000);
    habits.toggleHabit(s, h.id, addDays(TODAY, -20), NOW.getTime());
    expect(habits.habitDoneOn(s, h.id, addDays(TODAY, -20))).toBe(false);
    habits.toggleHabit(s, h.id, TODAY, NOW.getTime());
    habits.toggleHabit(s, h.id, TODAY, NOW.getTime());
    expect(game.totalXP(s)).toBe(0);
  });

  test('specific-day schedules skip unscheduled days in streaks', () => {
    const s = defaultState(NOW.getTime());
    // Mon/Wed/Fri habit; today is Thursday
    const h = habits.addHabit(s, { name: 'Gym', schedule: { type: 'days', days: [1, 3, 5] } }, NOW.getTime() - 14 * 86400000);
    habits.toggleHabit(s, h.id, addDays(TODAY, -1), NOW.getTime()); // Wed
    habits.toggleHabit(s, h.id, addDays(TODAY, -3), NOW.getTime()); // Mon
    habits.toggleHabit(s, h.id, addDays(TODAY, -6), NOW.getTime()); // Fri
    expect(habits.habitStats(s, h, TODAY).current).toBe(3);
  });
});

describe('natural language input', () => {
  const cats = [{ id: 'work', name: 'Work' }];
  test('“Remind me to call John tomorrow at 10”', () => {
    const r = parseTaskInput('Remind me to call John tomorrow at 10', { now: NOW, categories: cats });
    expect(r).toMatchObject({ title: 'Call John', dueDate: addDays(TODAY, 1), dueTime: '10:00' });
  });
  test('weekday, pm time, priority, category, label, duration', () => {
    const r = parseTaskInput('Submit report friday 3:30pm !urgent #work #q4 for 45 min', { now: NOW, categories: cats });
    expect(r).toMatchObject({ title: 'Submit report', dueDate: addDays(TODAY, 1), dueTime: '15:30', priority: 'urgent', categoryId: 'work', labels: ['q4'], estimate: 45 });
  });
  test('month dates and plain titles', () => {
    expect(parseTaskInput('Buy gift on dec 24', { now: NOW }).dueDate).toBe('2026-12-24');
    expect(parseTaskInput('Pay rent 3 jan', { now: NOW }).dueDate).toBe('2027-01-03');
    expect(parseTaskInput('Read a book', { now: NOW })).toMatchObject({ title: 'Read a book', dueDate: null, dueTime: null });
  });
  test('bare time that has passed rolls to tomorrow', () => {
    expect(parseTaskInput('Stretch at 8am', { now: NOW }).dueDate).toBe(addDays(TODAY, 1));
  });
});

describe('planner', () => {
  test('orders by urgency, respects available time and adds breaks', () => {
    const s = defaultState();
    tasks.createTask(s, { title: 'Overdue urgent', priority: 'urgent', dueDate: addDays(TODAY, -1), estimate: 60 });
    tasks.createTask(s, { title: 'Due today', priority: 'medium', dueDate: TODAY, estimate: 45 });
    tasks.createTask(s, { title: 'Low later', priority: 'low', dueDate: addDays(TODAY, 3), estimate: 30 });
    tasks.createTask(s, { title: 'Huge', priority: 'low', dueDate: addDays(TODAY, 2), estimate: 400 });
    const plan = planDay(s, { date: TODAY, start: '09:00', end: '13:00', energy: 'medium', now: NOW });
    const titles = plan.items.map((i) => s.tasks.find((t) => t.id === i.taskId).title);
    expect(titles[0]).toBe('Overdue urgent');
    expect(plan.items[0].start).toBe('10:00'); // starts from now, not the past
    expect(plan.overflow.length).toBe(1);
    expect(plan.breaks.length).toBeGreaterThan(0);
    applyPlan(s, plan);
    expect(s.tasks.find((t) => t.title === 'Due today').dueTime).toBeTruthy();
  });

  test('low energy puts quick wins first', () => {
    const s = defaultState();
    tasks.createTask(s, { title: 'Big', priority: 'high', dueDate: TODAY, estimate: 90 });
    tasks.createTask(s, { title: 'Quick', priority: 'low', dueDate: TODAY, estimate: 10 });
    const plan = planDay(s, { date: TODAY, start: '09:00', end: '18:00', energy: 'low', now: NOW });
    expect(s.tasks.find((t) => t.id === plan.items[0].taskId).title).toBe('Quick');
  });

  test('rescheduling suggests days with spare capacity', () => {
    const s = defaultState();
    tasks.createTask(s, { title: 'Busy today', dueDate: TODAY, estimate: 60 });
    tasks.createTask(s, { title: 'Late', dueDate: addDays(TODAY, -3), estimate: 30 });
    const [sug] = suggestReschedule(s, { now: NOW, capacity: 60 });
    expect(sug.to).toBe(addDays(TODAY, 1));
  });
});

describe('garden, levels, store', () => {
  test('energy is required and refunds are partial', () => {
    const s = defaultState();
    expect(() => garden.placeItem(s, 'tulip', 0, 0)).toThrow('Not enough');
    for (let i = 0; i < 3; i++) {
      const t = tasks.createTask(s, { title: `t${i}` }, NOW.getTime());
      tasks.completeTask(s, t.id, NOW.getTime());
    }
    expect(game.energyBalance(s).balance).toBe(15);
    garden.placeItem(s, 'tulip', 0, 0);
    expect(() => garden.placeItem(s, 'daisy', 0, 0)).toThrow('taken');
    expect(() => garden.placeItem(s, 'tree', 1, 0)).toThrow('level');
    expect(game.energyBalance(s).balance).toBe(7);
    garden.removeItem(s, s.garden.items[0].id);
    expect(game.energyBalance(s).balance).toBe(11);
  });

  test('levels', () => {
    expect(game.levelInfo(0).name).toBe('Beginner');
    expect(game.levelInfo(320)).toMatchObject({ level: 3, name: 'Consistent', toNext: 380 });
    expect(game.levelInfo(5000).name).toBe('Zen Master');
  });

  test('undo restores deleted tasks; export/import round-trips', () => {
    initStore({ storage: memory() });
    addMiddleware({ before: (s) => game.totalXP(s), after: (s, xp) => game.evaluate(s, Date.now(), xp) });
    const t = update((s) => tasks.createTask(s, { title: 'Keep me' }));
    update((s) => tasks.deleteTasks(s, [t.id]), { undo: 'Deleted' });
    expect(getState().tasks.length).toBe(0);
    undo();
    expect(getState().tasks[0].title).toBe('Keep me');
    const dump = exportData();
    update((s) => tasks.deleteTasks(s, [t.id]));
    importData(dump);
    expect(getState().tasks[0].title).toBe('Keep me');
    expect(() => importData('{"nope":1}')).toThrow();
  });

  test('normalizeState fills missing fields from partial data', () => {
    const s = normalizeState({ tasks: [{ title: 'x' }], settings: { theme: 'dark' } });
    expect(s.settings.focus.work).toBe(25);
    expect(s.settings.theme).toBe('dark');
    expect(s.tasks[0].subtasks).toEqual([]);
  });
});

describe('insights + reminders', () => {
  test('weekly summary counts real completions only', () => {
    const s = defaultState();
    const t = tasks.createTask(s, { title: 'Done', dueDate: TODAY }, NOW.getTime());
    tasks.completeTask(s, t.id, NOW.getTime());
    tasks.createTask(s, { title: 'Open', dueDate: addDays(TODAY, -1) }, NOW.getTime());
    const w = periodSummary(s, 'week', TODAY, 1);
    expect(w.completed).toBe(1);
    expect(w.unfinished.map((x) => x.title)).toEqual(['Open']);
  });

  test('reminders fire once per key', () => {
    const s = defaultState();
    tasks.createTask(s, { title: 'Call', dueDate: TODAY, dueTime: '10:10' });
    tasks.createTask(s, { title: 'Late', dueDate: addDays(TODAY, -1) });
    const r = dueReminders(s, NOW);
    expect(r.map((x) => x.type).sort()).toEqual(['deadline', 'overdue', 'planning']);
    for (const x of r) for (const k of [].concat(x.key)) s.notified[k] = 1;
    expect(dueReminders(s, NOW).length).toBe(0);
  });
});
